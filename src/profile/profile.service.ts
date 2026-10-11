import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, UpdateProfileDto } from './dto';

const PROFILE_SELECT = {
  id: true,
  name: true,
  lastName: true,
  jerseyName: true,
  preferredNumber: true,
  photoUrl: true,
  heroPhotoUrl: true,
  email: true,
  phone: true,
  securityQuestion: true,
  roles: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const BCRYPT_COST = 12;

function hashAnswer(answer: string): string {
  return createHash('sha256').update(answer.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const { securityAnswer, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (securityAnswer !== undefined) {
      const trimmed = securityAnswer.trim();
      data.securityAnswerHash = trimmed ? hashAnswer(trimmed) : null;
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentValid) {
      throw new BadRequestException('Contraseña actual incorrecta');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta a la actual');
    }

    const hashed = await bcrypt.hash(dto.newPassword, BCRYPT_COST);

    // Cambiamos password y revocamos refresh tokens activos (logout en otros dispositivos).
    // El access token actual sigue válido hasta expirar (30 min) — comportamiento estándar.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { password: hashed } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    return { message: 'Contraseña actualizada. Otros dispositivos fueron deslogueados.' };
  }
}
