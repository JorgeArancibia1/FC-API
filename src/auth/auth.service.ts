import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  ChangeRoleDto,
  ForgotPasswordDto,
  LoginUserDto,
  RecoverEmailDto,
  RegisterUserDto,
  ResetPasswordDto,
} from './dto';
import { DEVELOPER_EMAIL, PASSWORD_RESET_TTL_MS, UserRole } from '../common';
import { CurrentUser } from '../common/interfaces';
import { envs } from '../config/envs';

const BCRYPT_COST = 12;
const REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  roles: true,
  status: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  // ============================================================================
  // REGISTER
  // ============================================================================

  async register(dto: RegisterUserDto) {
    const { name, lastName, jerseyName, preferredNumber, email, password } = dto;

    this.logger.log(`[register] email=${email}`);

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new ConflictException(`El correo ${normalizedEmail} ya está registrado`);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    // El rol developer está reservado a un único email. El resto elige su rol
    // inicial ("quiero administrar partidos" = admin, "quiero jugar" = usuario).
    const roles: UserRole[] =
      normalizedEmail === DEVELOPER_EMAIL
        ? [UserRole.DEVELOPER]
        : [dto.role === 'admin' ? UserRole.ADMIN : UserRole.USUARIO];

    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          lastName,
          jerseyName,
          preferredNumber,
          email: normalizedEmail,
          password: hashedPassword,
          roles,
          status: 'activo',
          phone: dto.phone?.trim() || null,
          securityQuestion: dto.securityQuestion?.trim() || null,
          securityAnswerHash: dto.securityAnswer ? hashAnswer(dto.securityAnswer) : null,
        },
        select: {
          id: true,
          name: true,
          lastName: true,
          jerseyName: true,
          preferredNumber: true,
          email: true,
          roles: true,
          status: true,
          createdAt: true,
        },
      });

      this.logger.log(`✅ Registro: ${normalizedEmail} roles=${roles.join(',')}`);

      // Atribución best-effort: si vino con una invitación a la plataforma
      // (link o código), deja registrado que este usuario la aceptó para que
      // el invitador lo vea en la pestaña "Usuarios". No bloquea el registro.
      await this.attributePlatformInvite(dto, user.id);

      return { message: 'Cuenta creada', user };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(`El correo ${normalizedEmail} ya está registrado`);
      }
      this.logger.error(`Error registrando: ${(error as Error).message}`);
      throw new InternalServerErrorException('No se pudo crear la cuenta');
    }
  }

  // Atribución best-effort: si el registro trae un token o código de invitación
  // a la plataforma, marca al usuario como aceptante en esa invitación. Si el
  // token/código no existe o expiró, no se interrumpe el registro.
  private async attributePlatformInvite(dto: RegisterUserDto, userId: string): Promise<void> {
    const { platformInviteToken, platformInviteCode } = dto;
    if (!platformInviteToken && !platformInviteCode) return;

    try {
      const invite = platformInviteToken
        ? await this.prisma.platformInvite.findUnique({ where: { token: platformInviteToken } })
        : await this.prisma.platformInvite.findFirst({
            where: { code: platformInviteCode, revoked: false, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
          });

      if (!invite || invite.revoked || invite.expiresAt <= new Date()) {
        this.logger.warn('[register] invitación de plataforma inválida o expirada (se ignora)');
        return;
      }

      if ((invite.acceptedByIds ?? []).includes(userId)) return;

      await this.prisma.platformInvite.update({
        where: { id: invite.id },
        data: { acceptedByIds: { push: userId }, uses: { increment: 1 } },
      });

      this.logger.log(`🔗 Registro atribuido a invitación de plataforma ${invite.id}`);
    } catch (error) {
      this.logger.warn(
        `No se pudo atribuir la invitación de plataforma: ${(error as Error).message}`,
      );
    }
  }

  // ============================================================================
  // LOGIN
  // ============================================================================

  async login(dto: LoginUserDto) {
    const email = dto.email.trim().toLowerCase();
    const { password } = dto;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('Email o contraseña incorrectos');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Email o contraseña incorrectos');
    }

    if (user.status !== 'activo') {
      throw new BadRequestException('Cuenta no disponible');
    }

    const currentUser = toCurrentUser(user);
    const token = this.jwtService.sign(currentUser);

    const jti = uuidv4();
    const refreshToken = this.jwtService.sign(currentUser, {
      jwtid: jti,
      expiresIn: envs.refreshTokenExpiresIn as any,
    });
    const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_COST);

    try {
      await this.prisma.refreshToken.create({
        data: {
          jti,
          userId: user.id,
          token: hashedRefreshToken,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_MS),
        },
      });
    } catch (error) {
      this.logger.error(`Error persistiendo RT en login: ${(error as Error).message}`);
      throw new InternalServerErrorException('No se pudo iniciar sesión. Intenta nuevamente.');
    }

    this.logger.log(`✅ Login: ${email}`);
    return { message: 'Login exitoso', user: currentUser, token, refreshToken };
  }

  // ============================================================================
  // VERIFY (refresca roles/estado desde la BD: permisos siempre al día)
  // ============================================================================

  async verifyToken(token: string) {
    let payload: { id: string };
    try {
      payload = this.jwtService.verify(token, { secret: envs.jwtSecret });
    } catch (error) {
      this.logger.warn(`Token inválido o expirado: ${(error as Error).message}`);
      // 401 (no 400): el access token vencido es lo que dispara el refresh
      // silencioso del cliente (interceptor axios en FC-Front). Con 400 el
      // front no reintentaba y mostraba "Token inválido o expirado" en la UI.
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: AUTH_USER_SELECT,
    });

    if (!user || user.status.toLowerCase() !== 'activo') {
      throw new ForbiddenException('Sesión no válida');
    }

    return { user: toCurrentUser(user) };
  }

  // ============================================================================
  // REFRESH
  // ============================================================================

  async refreshAccessToken(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: envs.jwtSecret });
    } catch (error) {
      this.logger.warn(`RT inválido: ${(error as Error).message}`);
      throw new BadRequestException('Refresh token inválido o expirado');
    }

    if (!payload.jti) {
      throw new BadRequestException('Refresh token sin identificador');
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
    if (!stored) throw new BadRequestException('Refresh token no encontrado');
    if (stored.expiresAt < new Date()) throw new BadRequestException('Refresh token expirado');

    if (stored.isRevoked) {
      this.logger.error(`⚠️ Reuse detectado para userId=${payload.id} — revocando familia`);
      await this.revokeAllUserTokens(payload.id);
      throw new ForbiddenException('Sesión revocada por seguridad. Vuelve a iniciar sesión.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: AUTH_USER_SELECT,
    });
    if (!user || user.status.toLowerCase() !== 'activo') {
      throw new BadRequestException('Usuario no disponible');
    }

    const currentUser = toCurrentUser(user);
    const token = this.jwtService.sign(currentUser);

    const jti = uuidv4();
    const newRefreshToken = this.jwtService.sign(currentUser, {
      jwtid: jti,
      expiresIn: envs.refreshTokenExpiresIn as any,
    });
    const hashedRefreshToken = await bcrypt.hash(newRefreshToken, BCRYPT_COST);

    try {
      await this.prisma.$transaction([
        this.prisma.refreshToken.update({ where: { id: stored.id }, data: { isRevoked: true } }),
        this.prisma.refreshToken.create({
          data: {
            jti,
            userId: user.id,
            token: hashedRefreshToken,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_MS),
          },
        }),
      ]);
    } catch (error) {
      this.logger.error(`Error en rotación de RT: ${(error as Error).message}`);
      throw new InternalServerErrorException('No se pudo renovar la sesión');
    }

    return { message: 'Sesión renovada', user: currentUser, token, refreshToken: newRefreshToken };
  }

  // ============================================================================
  // PASSWORD RESET
  // ============================================================================

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const neutral = { message: 'Si el correo está registrado, enviaremos instrucciones.' };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, status: true },
    });

    if (!user || user.status.toLowerCase() !== 'activo') {
      // Respuesta neutral: no revelamos si el correo existe.
      return neutral;
    }

    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: sha256(token),
        resetTokenExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const resetUrl = `${envs.appPublicUrl.replace(/\/$/, '')}/restablecer/${token}`;
    const { delivered } = await this.mailService.sendPasswordReset(user.email, user.name, resetUrl);

    // Solo en desarrollo y sin SMTP devolvemos el enlace para poder probar.
    if (!delivered && envs.nodeEnv !== 'production') {
      return { ...neutral, devLink: resetUrl };
    }

    return neutral;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetTokenHash: sha256(dto.token),
        resetTokenExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('El enlace es inválido o ya expiró');
    }

    const hashed = await bcrypt.hash(dto.newPassword, BCRYPT_COST);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, resetTokenHash: null, resetTokenExpiresAt: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    return { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }

  // ============================================================================
  // RECOVER EMAIL (olvidé mi correo)
  // ============================================================================

  async recoverEmail(dto: RecoverEmailDto) {
    const emails = new Set<string>();

    if (dto.phone) {
      const byPhone = await this.prisma.user.findMany({
        where: { phone: dto.phone.trim(), status: { not: 'eliminado' } },
        select: { email: true },
      });
      byPhone.forEach((u) => emails.add(u.email));
    }

    if (dto.securityQuestion && dto.securityAnswer) {
      const byQuestion = await this.prisma.user.findMany({
        where: {
          securityQuestion: dto.securityQuestion.trim(),
          securityAnswerHash: hashAnswer(dto.securityAnswer),
          status: { not: 'eliminado' },
        },
        select: { email: true },
      });
      byQuestion.forEach((u) => emails.add(u.email));
    }

    return {
      message:
        emails.size > 0
          ? 'Encontramos correos asociados a tu información.'
          : 'No encontramos correos con esos datos.',
      emails: [...emails],
    };
  }

  // ============================================================================
  // SELF ROLE SWITCH (usuario ↔ admin)
  // ============================================================================

  async changeRole(userId: string, dto: ChangeRoleDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: AUTH_USER_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (user.roles.includes(UserRole.DEVELOPER)) {
      throw new ForbiddenException('La cuenta de desarrollador no cambia de rol');
    }

    const nextRole = dto.role === 'admin' ? UserRole.ADMIN : UserRole.USUARIO;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { roles: [nextRole] },
      select: AUTH_USER_SELECT,
    });

    const currentUser = toCurrentUser(updated);
    // Emitimos un token nuevo para que el cambio de permisos aplique de inmediato.
    const token = this.jwtService.sign(currentUser);

    this.logger.log(`🔁 Cambio de rol: ${updated.email} → ${nextRole}`);
    return {
      message: nextRole === UserRole.ADMIN ? 'Ahora administras partidos' : 'Ahora juegas',
      user: currentUser,
      token,
    };
  }

  // ============================================================================
  // REVOKE
  // ============================================================================

  async revokeRefreshToken(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: envs.jwtSecret });
    } catch {
      throw new BadRequestException('Token inválido o expirado');
    }

    if (!payload.jti) throw new BadRequestException('Refresh token sin identificador');

    const stored = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
    if (!stored) return { message: 'Token revocado exitosamente' };

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { isRevoked: true } });
    this.logger.log(`✅ Logout de dispositivo para userId=${payload.id}`);
    return { message: 'Token revocado exitosamente' };
  }

  async revokeAllUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } });
    this.logger.log(`✅ Todos los tokens revocados para userId=${userId}`);
    return { message: 'Todos los tokens han sido revocados' };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  async validateUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    return user;
  }
}

function toCurrentUser(user: {
  id: string;
  name: string;
  email: string;
  roles: unknown;
  status: string;
}): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles as UserRole[],
    status: user.status,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashAnswer(answer: string): string {
  return sha256(answer.trim().toLowerCase());
}
