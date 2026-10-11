import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { CurrentUser, UserRole } from '../common';

const BCRYPT_COST = 12;

const USER_SELECT = {
  id: true,
  name: true,
  lastName: true,
  jerseyName: true,
  preferredNumber: true,
  photoUrl: true,
  email: true,
  roles: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const isDeveloper = (roles: UserRole[]) => roles.includes(UserRole.DEVELOPER);

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: CurrentUser, scope?: string) {
    // "Solo invitados" (pestaña Usuarios de un admin): únicamente los usuarios
    // que aceptaron una invitación suya (link o código). El developer siempre
    // ve todos, y el resto de vistas (dashboard, inscribir jugadores) piden la
    // lista completa sin scope.
    const onlyInvited = scope === 'invited' && !isDeveloper(actor.roles);

    if (!onlyInvited) {
      return this.prisma.user.findMany({
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
      });
    }

    const [matchInvites, platformInvites] = await Promise.all([
      this.prisma.matchInvite.findMany({
        where: { createdById: actor.id },
        select: { acceptedByIds: true },
      }),
      this.prisma.platformInvite.findMany({
        where: { createdById: actor.id },
        select: { acceptedByIds: true },
      }),
    ]);
    const invitedIds = [
      ...new Set([
        ...matchInvites.flatMap((i) => i.acceptedByIds ?? []),
        ...platformInvites.flatMap((i) => i.acceptedByIds ?? []),
      ]),
    ];
    if (invitedIds.length === 0) return [];

    return this.prisma.user.findMany({
      where: { id: { in: invitedIds } },
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateUserDto, actor: CurrentUser) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException(`El correo ${dto.email} ya está registrado`);
    }

    const roles = dto.roles ?? [UserRole.USUARIO];
    if (roles.includes(UserRole.DEVELOPER) && !isDeveloper(actor.roles)) {
      throw new ForbiddenException('Solo el desarrollador puede asignar ese rol');
    }

    const hashed = await bcrypt.hash(dto.password, BCRYPT_COST);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        lastName: dto.lastName,
        email: dto.email,
        password: hashed,
        roles,
      },
      select: USER_SELECT,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: CurrentUser) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, roles: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    // La cuenta de desarrollador solo la puede tocar el propio desarrollador.
    if (isDeveloper(target.roles as UserRole[]) && !isDeveloper(actor.roles)) {
      throw new ForbiddenException('No puedes modificar la cuenta del desarrollador');
    }

    if (dto.roles) {
      if (dto.roles.includes(UserRole.DEVELOPER) && !isDeveloper(actor.roles)) {
        throw new ForbiddenException('Solo el desarrollador puede asignar ese rol');
      }
      // Un no-developer no puede quitarse/quitar el rol developer.
      if (isDeveloper(target.roles as UserRole[]) && !dto.roles.includes(UserRole.DEVELOPER)) {
        throw new ForbiddenException('No puedes quitar el rol de desarrollador');
      }
    }

    const { password, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (password) {
      data.password = await bcrypt.hash(password, BCRYPT_COST);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data, select: USER_SELECT }),
      ...(password
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId: id, isRevoked: false },
              data: { isRevoked: true },
            }),
          ]
        : []),
    ]);

    return updated;
  }

  async softDelete(id: string, actor: CurrentUser) {
    if (id === actor.id) {
      throw new BadRequestException('No puedes eliminarte a ti mismo');
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, roles: true, status: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    if (isDeveloper(target.roles as UserRole[])) {
      throw new ForbiddenException('La cuenta de desarrollador no puede eliminarse');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: 'eliminado' } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    return { message: 'Usuario eliminado' };
  }
}
