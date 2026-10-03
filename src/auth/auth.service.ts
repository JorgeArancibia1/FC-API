import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { LoginUserDto, RegisterUserDto } from './dto';
import { CurrentUser, UserRole } from '../common';
import { envs } from '../config/envs';

const BCRYPT_COST = 12;
const REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ============================================================================
  // REGISTER
  // ============================================================================

  async register(dto: RegisterUserDto) {
    const { name, lastName, jerseyName, preferredNumber, email, password } = dto;

    this.logger.log(`[register] email=${email}`);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(`El correo ${email} ya está registrado`);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          lastName,
          jerseyName,
          preferredNumber,
          email,
          password: hashedPassword,
          roles: [UserRole.USUARIO],
          status: 'activo',
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

      this.logger.log(`✅ Usuario registrado: ${email}`);
      return { message: 'Usuario registrado exitosamente', user };
    } catch (error: any) {
      this.logger.error(`Error al registrar: ${(error as Error).message}`);
      if (error?.code === 'P2002') {
        throw new BadRequestException('El correo electrónico ya está registrado');
      }
      throw new BadRequestException('Error al registrar el usuario');
    }
  }

  // ============================================================================
  // LOGIN
  // ============================================================================

  async login(dto: LoginUserDto) {
    const { email, password } = dto;

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

    const currentUser: CurrentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles as UserRole[],
      status: user.status,
    };

    const token = this.jwtService.sign(currentUser);

    // Refresh token rotation con jti único — permite lookup O(1) y reuse detection.
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

    this.logger.log(`✅ Login exitoso: ${email}`);
    return {
      message: 'Login exitoso',
      user: currentUser,
      token,
      refreshToken,
    };
  }

  // ============================================================================
  // VERIFY
  // ============================================================================

  async verifyToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, { secret: envs.jwtSecret });

      const currentUser: CurrentUser = {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        roles: payload.roles,
        status: payload.status,
      };

      return { user: currentUser };
    } catch (error) {
      this.logger.warn(`Token inválido o expirado: ${(error as Error).message}`);
      throw new UnauthorizedException('Token inválido o expirado');
    }
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
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (!payload.jti) {
      throw new UnauthorizedException('Refresh token sin identificador');
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } });

    if (!stored) {
      throw new UnauthorizedException('Refresh token no encontrado');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Reuse detection: si llega un RT ya revocado, asumimos robo y revocamos toda la familia.
    if (stored.isRevoked) {
      this.logger.error(`⚠️ Reuse detectado para userId=${payload.id} — revocando familia`);
      await this.revokeAllUserTokens(payload.id);
      throw new UnauthorizedException(
        'Sesión revocada por seguridad. Por favor vuelve a iniciar sesión.',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.status.toLowerCase() !== 'activo') {
      throw new UnauthorizedException('Usuario no disponible');
    }

    const currentUser: CurrentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles as UserRole[],
      status: user.status,
    };

    const newAccessToken = this.jwtService.sign(currentUser);
    const newRefreshToken = await this.rotateRefreshToken(stored.id, currentUser);

    this.logger.log(`✅ Token renovado: ${user.email}`);
    return {
      message: 'Token renovado',
      user: currentUser,
      token: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  private async rotateRefreshToken(currentTokenId: string, user: CurrentUser): Promise<string> {
    const newJti = uuidv4();
    const newRefreshToken = this.jwtService.sign(user, {
      jwtid: newJti,
      expiresIn: envs.refreshTokenExpiresIn as any,
    });
    const hashedNew = await bcrypt.hash(newRefreshToken, BCRYPT_COST);

    try {
      await this.prisma.$transaction([
        this.prisma.refreshToken.update({
          where: { id: currentTokenId },
          data: { isRevoked: true },
        }),
        this.prisma.refreshToken.create({
          data: {
            jti: newJti,
            userId: user.id,
            token: hashedNew,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_MS),
          },
        }),
      ]);
    } catch (error) {
      this.logger.error(`Error en rotación de RT: ${(error as Error).message}`);
      throw new InternalServerErrorException('No se pudo rotar el refresh token');
    }

    return newRefreshToken;
  }

  // ============================================================================
  // REVOKE
  // ============================================================================

  async revokeRefreshToken(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: envs.jwtSecret });
    } catch (error) {
      throw new BadRequestException('Token inválido o expirado');
    }

    if (!payload.jti) {
      throw new BadRequestException('Refresh token sin identificador');
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } });

    if (!stored) {
      // No hay nada que revocar — el cliente queda igual sin sesión, no es error.
      return { message: 'Token revocado exitosamente' };
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    this.logger.log(`✅ Logout de dispositivo para userId=${payload.id}`);
    return { message: 'Token revocado exitosamente' };
  }

  async revokeAllUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
    this.logger.log(`✅ Todos los tokens revocados para userId=${userId}`);
    return { message: 'Todos los tokens han sido revocados' };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  async validateUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }
    return user;
  }
}
