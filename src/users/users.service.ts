import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { UserRole } from '../common';

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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException(`El correo ${dto.email} ya está registrado`);
    }
    const hashed = await bcrypt.hash(dto.password, BCRYPT_COST);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        lastName: dto.lastName,
        email: dto.email,
        password: hashed,
        roles: dto.roles ?? [UserRole.USUARIO],
      },
      select: USER_SELECT,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, roles: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    // Si el admin se está editando a sí mismo, no permitir quitarse el rol admin.
    if (target.id === actingUserId && dto.roles && !dto.roles.includes(UserRole.ADMIN)) {
      throw new BadRequestException('No puedes quitarte el rol de admin a ti mismo');
    }

    // Si se quitaría el último admin del sistema, bloquear.
    if (dto.roles && target.roles.includes(UserRole.ADMIN) && !dto.roles.includes(UserRole.ADMIN)) {
      const otherAdmins = await this.prisma.user.count({
        where: { id: { not: id }, roles: { has: UserRole.ADMIN }, status: { not: 'eliminado' } },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException('No puedes quitar al único admin del sistema');
      }
    }

    // Si viene password, la hasheamos y revocamos refresh tokens del target para
    // forzar logout de sus sesiones activas. Patrón estándar de admin-reset.
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

  async softDelete(id: string, actingUserId: string) {
    if (id === actingUserId) {
      throw new BadRequestException('No puedes eliminarte a ti mismo');
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, roles: true, status: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    // No permitir eliminar al último admin.
    if (target.roles.includes(UserRole.ADMIN)) {
      const otherAdmins = await this.prisma.user.count({
        where: { id: { not: id }, roles: { has: UserRole.ADMIN }, status: { not: 'eliminado' } },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException('No puedes eliminar al único admin del sistema');
      }
    }

    // Soft delete: marca como eliminado y revoca refresh tokens activos.
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
