import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto, UpdateMatchDto } from './dto';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateMatchDto, createdById: string) {
    return this.prisma.match.create({
      data: { ...dto, createdById },
    });
  }

  findAll() {
    return this.prisma.match.findMany({
      orderBy: { dateTime: 'asc' },
      include: {
        _count: { select: { registrations: true } },
      },
    });
  }

  async findOne(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        registrations: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                jerseyName: true,
                preferredNumber: true,
                photoUrl: true,
                heroPhotoUrl: true,
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!match) {
      throw new NotFoundException(`Partido ${id} no encontrado`);
    }

    // Orden: position asc primero (los reordenados manualmente),
    // luego los sin position por registeredAt asc.
    // Esto centraliza la lógica de ordenamiento — Mongo+Prisma no permite
    // nulls-last directamente, así que lo hacemos en memoria.
    match.registrations.sort((a, b) => {
      if (a.position != null && b.position != null) return a.position - b.position;
      if (a.position != null) return -1;
      if (b.position != null) return 1;
      return new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime();
    });

    return match;
  }

  async update(id: string, dto: UpdateMatchDto) {
    await this.assertExists(id);
    return this.prisma.match.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.match.delete({ where: { id } });
    return { message: 'Partido eliminado' };
  }

  private async assertExists(id: string) {
    const exists = await this.prisma.match.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Partido ${id} no encontrado`);
  }
}
