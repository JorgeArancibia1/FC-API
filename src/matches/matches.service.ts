import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchGateway } from '../realtime/match.gateway';
import { CreateMatchDto, UpdateMatchDto } from './dto';

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchGateway: MatchGateway,
  ) {}

  async create(dto: CreateMatchDto, createdById: string) {
    const match = await this.prisma.match.create({
      data: { ...dto, createdById },
    });
    // Avisa a todos para que el partido nuevo aparezca sin recargar.
    this.matchGateway.emitMatchesChanged({ matchId: match.id });
    return match;
  }

  findAll() {
    return this.prisma.match.findMany({
      orderBy: { dateTime: 'asc' },
      include: {
        _count: { select: { registrations: true } },
      },
    });
  }

  findMine(userId: string) {
    return this.prisma.match.findMany({
      where: { registrations: { some: { userId } } },
      orderBy: { dateTime: 'asc' },
      include: {
        createdBy: { select: { id: true, name: true } },
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

    if (!match) throw new NotFoundException(`Partido ${id} no encontrado`);

    // La plantilla se arma por `position` (reorden manual) y, para quien no
    // tiene posición, por orden de inscripción. Sin restricción de secuencia.
    return match;
  }

  async update(id: string, dto: UpdateMatchDto) {
    await this.assertExists(id);
    const match = await this.prisma.match.update({
      where: { id },
      data: dto,
    });
    this.matchGateway.emitMatchesChanged({ matchId: id });
    return match;
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.match.delete({ where: { id } });
    this.matchGateway.emitMatchesChanged({ matchId: id });
    return { message: 'Partido eliminado' };
  }

  private async assertExists(id: string) {
    const exists = await this.prisma.match.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Partido ${id} no encontrado`);
  }
}
