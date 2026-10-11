import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationsService } from '../registrations/registrations.service';
import { CurrentUser, INVITE_CODE_LENGTH, INVITE_TTL_HOURS, UserRole } from '../common';
import { envs } from '../config/envs';

const INVITE_TTL_MS = INVITE_TTL_HOURS * 60 * 60 * 1000;

@Injectable()
export class InvitesService {
  private readonly logger = new Logger('InvitesService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registrations: RegistrationsService,
  ) {}

  // Crea link + código para un partido. Admin/developer: cualquier partido.
  // Usuario: solo partidos en los que está inscrito.
  async create(matchId: string, user: CurrentUser) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, status: true, place: true },
    });
    if (!match) throw new NotFoundException('Partido no encontrado');

    if (match.status === MatchStatus.cancelled || match.status === MatchStatus.finished) {
      throw new BadRequestException('No se pueden generar invitaciones para este partido');
    }

    const isStaff =
      user.roles.includes(UserRole.ADMIN) || user.roles.includes(UserRole.DEVELOPER);

    if (!isStaff) {
      const registration = await this.prisma.matchRegistration.findUnique({
        where: { matchId_userId: { matchId, userId: user.id } },
        select: { id: true },
      });
      if (!registration) {
        throw new ForbiddenException('Solo puedes invitar a partidos en los que estás inscrito');
      }
    }

    const code = await this.generateUniqueCode();
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await this.prisma.matchInvite.create({
      data: { matchId, createdById: user.id, code, token, expiresAt },
    });

    this.logger.log(`🔗 Invitación creada para partido ${matchId} (código ${code})`);

    return {
      id: invite.id,
      matchId,
      code: invite.code,
      token: invite.token,
      expiresAt: invite.expiresAt,
      url: this.buildUrl(invite.token),
    };
  }

  // Público: resolver un link de invitación.
  async resolveByToken(token: string) {
    const invite = await this.prisma.matchInvite.findUnique({ where: { token } });
    return this.describe(invite);
  }

  // Público: resolver un código de 6 dígitos (el más reciente vigente).
  async resolveByCode(code: string) {
    const invite = await this.prisma.matchInvite.findFirst({
      where: { code, revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return this.describe(invite);
  }

  // Requiere sesión: unirse al partido de la invitación (por token o código).
  async accept(user: CurrentUser, params: { token?: string; code?: string }) {
    if (!params.token && !params.code) {
      throw new BadRequestException('Debes indicar un link o un código');
    }

    const invite = params.token
      ? await this.prisma.matchInvite.findUnique({ where: { token: params.token } })
      : await this.prisma.matchInvite.findFirst({
          where: { code: params.code, revoked: false, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        });

    const resolved = await this.describe(invite);
    if (!resolved.invite.valid || !resolved.match) {
      throw new BadRequestException('La invitación no es válida o expiró');
    }

    const matchId = resolved.match.id;

    // Atribución: deja registrado que este usuario aceptó la invitación, para
    // que el invitador lo vea en la pestaña "Usuarios". Idempotente.
    if (invite && !(invite.acceptedByIds ?? []).includes(user.id)) {
      await this.prisma.matchInvite.update({
        where: { id: invite.id },
        data: { acceptedByIds: { push: user.id } },
      });
    }

    // Idempotente: si ya está inscrito, no es error.
    const existing = await this.prisma.matchRegistration.findUnique({
      where: { matchId_userId: { matchId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      return { message: 'Ya estabas inscrito en este partido', matchId };
    }

    try {
      await this.registrations.register(matchId, user.id);
    } catch (error) {
      if (error instanceof ConflictException) {
        return { message: 'Ya estabas inscrito en este partido', matchId };
      }
      throw error;
    }

    if (invite) {
      await this.prisma.matchInvite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      });
    }

    return { message: 'Te uniste al partido', matchId };
  }

  async revoke(id: string, user: CurrentUser) {
    const invite = await this.prisma.matchInvite.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('Invitación no encontrada');

    const isStaff =
      user.roles.includes(UserRole.ADMIN) || user.roles.includes(UserRole.DEVELOPER);
    if (!isStaff && invite.createdById !== user.id) {
      throw new ForbiddenException('No puedes revocar esta invitación');
    }

    await this.prisma.matchInvite.update({ where: { id }, data: { revoked: true } });
    return { message: 'Invitación revocada' };
  }

  // ============================================================================
  // INVITACIONES A LA PLATAFORMA (no ligadas a un partido)
  // ============================================================================

  // Crea link + código para invitar a la plataforma. Solo staff (admin/developer).
  async createPlatform(user: CurrentUser) {
    const isStaff =
      user.roles.includes(UserRole.ADMIN) || user.roles.includes(UserRole.DEVELOPER);
    if (!isStaff) {
      throw new ForbiddenException('Solo el staff puede invitar usuarios a la plataforma');
    }

    const code = await this.generateUniquePlatformCode();
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await this.prisma.platformInvite.create({
      data: { createdById: user.id, code, token, expiresAt },
    });

    this.logger.log(`🔗 Invitación de plataforma creada por ${user.email} (código ${code})`);

    return {
      id: invite.id,
      code: invite.code,
      token: invite.token,
      expiresAt: invite.expiresAt,
      url: this.buildPlatformUrl(invite.token),
    };
  }

  // Público: resolver un link de invitación a la plataforma.
  async resolvePlatformByToken(token: string) {
    const invite = await this.prisma.platformInvite.findUnique({ where: { token } });
    return this.describePlatform(invite);
  }

  // Público: resolver un código de 6 dígitos (el más reciente vigente).
  async resolvePlatformByCode(code: string) {
    const invite = await this.prisma.platformInvite.findFirst({
      where: { code, revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return this.describePlatform(invite);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private buildUrl(token: string): string {
    return `${envs.appPublicUrl.replace(/\/$/, '')}/invitacion/${token}`;
  }

  private buildPlatformUrl(token: string): string {
    return `${envs.appPublicUrl.replace(/\/$/, '')}/registro?invitacion=${token}`;
  }

  private async generateUniquePlatformCode(): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt++) {
      const code = randomInt(0, 10 ** INVITE_CODE_LENGTH)
        .toString()
        .padStart(INVITE_CODE_LENGTH, '0');
      const clash = await this.prisma.platformInvite.findFirst({
        where: { code, revoked: false, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new BadRequestException('No se pudo generar un código, intenta nuevamente');
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt++) {
      const code = randomInt(0, 10 ** INVITE_CODE_LENGTH)
        .toString()
        .padStart(INVITE_CODE_LENGTH, '0');
      const clash = await this.prisma.matchInvite.findFirst({
        where: { code, revoked: false, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new BadRequestException('No se pudo generar un código, intenta nuevamente');
  }

  private async describe(
    invite: {
      id: string;
      matchId: string;
      code: string;
      token: string;
      expiresAt: Date;
      uses: number;
      revoked: boolean;
    } | null,
  ) {
    const now = new Date();
    const valid = !!invite && !invite.revoked && invite.expiresAt > now;

    if (!invite) {
      return {
        invite: { valid: false, code: null, expiresAt: null, uses: 0 },
        match: null,
      };
    }

    const match = await this.prisma.match.findUnique({
      where: { id: invite.matchId },
      select: {
        id: true,
        place: true,
        dateTime: true,
        requiredPlayers: true,
        status: true,
        notes: true,
        createdBy: { select: { name: true } },
        _count: { select: { registrations: true } },
      },
    });

    return {
      invite: {
        valid,
        code: valid ? invite.code : null,
        expiresAt: invite.expiresAt,
        uses: invite.uses,
      },
      match: match
        ? {
            id: match.id,
            place: match.place,
            dateTime: match.dateTime,
            requiredPlayers: match.requiredPlayers,
            status: match.status,
            notes: match.notes,
            createdByName: match.createdBy.name,
            registeredCount: match._count.registrations,
          }
        : null,
    };
  }

  private async describePlatform(
    invite: {
      id: string;
      createdById: string;
      code: string;
      expiresAt: Date;
      uses: number;
      revoked: boolean;
    } | null,
  ) {
    if (!invite) {
      return {
        invite: { valid: false, code: null, expiresAt: null, uses: 0 },
        inviterName: null,
      };
    }

    const valid = !invite.revoked && invite.expiresAt > new Date();
    const creator = await this.prisma.user.findUnique({
      where: { id: invite.createdById },
      select: { name: true, lastName: true },
    });

    return {
      invite: {
        valid,
        code: valid ? invite.code : null,
        expiresAt: invite.expiresAt,
        uses: invite.uses,
      },
      inviterName: creator
        ? `${creator.name}${creator.lastName ? ` ${creator.lastName}` : ''}`.trim()
        : null,
    };
  }
}
