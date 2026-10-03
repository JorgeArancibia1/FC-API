import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchGateway } from '../realtime/match.gateway';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger('RegistrationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchGateway: MatchGateway,
  ) {}

  async register(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { _count: { select: { registrations: true } } },
    });

    if (!match) throw new NotFoundException(`Partido ${matchId} no encontrado`);
    if (match.status !== MatchStatus.open) {
      throw new BadRequestException('El partido no está aceptando inscripciones');
    }
    if (match._count.registrations >= match.requiredPlayers) {
      throw new BadRequestException('El partido ya tiene el cupo lleno');
    }

    try {
      const registration = await this.prisma.matchRegistration.create({
        data: { matchId, userId },
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
      });

      // Si tras esta inscripción se llenó el cupo, cerrar el partido automáticamente.
      const newCount = match._count.registrations + 1;
      if (newCount >= match.requiredPlayers) {
        await this.prisma.match.update({
          where: { id: matchId },
          data: { status: MatchStatus.closed },
        });
      }

      this.matchGateway.emitPlayerRegistered(matchId, registration);
      this.logger.log(`✅ ${registration.user.name} inscrito al partido ${matchId}`);

      return registration;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Ya estás inscrito en este partido');
      }
      throw error;
    }
  }

  async unregister(matchId: string, userId: string) {
    const registration = await this.prisma.matchRegistration.findUnique({
      where: { matchId_userId: { matchId, userId } },
    });

    if (!registration) {
      throw new NotFoundException('No estás inscrito en este partido');
    }

    await this.prisma.matchRegistration.delete({ where: { id: registration.id } });

    // Si el partido estaba cerrado por cupo lleno, reabrirlo al liberarse un cupo.
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true },
    });
    if (match?.status === MatchStatus.closed) {
      await this.prisma.match.update({
        where: { id: matchId },
        data: { status: MatchStatus.open },
      });
    }

    this.matchGateway.emitPlayerUnregistered(matchId, userId);
    this.logger.log(`👋 userId=${userId} se retiró del partido ${matchId}`);

    return { message: 'Inscripción cancelada' };
  }

  // Aplica un conjunto de asignaciones {registrationId, position} en transacción.
  // Permite huecos: si solo cambia 1 jugador, solo se envía esa asignación.
  // Las posiciones pueden ser cualquier valor 1..requiredPlayers (sin restricción de secuencia).
  async reorder(
    matchId: string,
    assignments: { registrationId: string; position: number }[],
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { registrations: { select: { id: true } } },
    });
    if (!match) throw new NotFoundException(`Partido ${matchId} no encontrado`);

    const existingIds = new Set(match.registrations.map((r) => r.id));
    const seenPositions = new Set<number>();
    const seenRegIds = new Set<string>();

    for (const a of assignments) {
      if (!existingIds.has(a.registrationId)) {
        throw new BadRequestException(
          `La inscripción ${a.registrationId} no pertenece a este partido`,
        );
      }
      if (a.position < 1 || a.position > match.requiredPlayers) {
        throw new BadRequestException(
          `Posición ${a.position} fuera de rango (1..${match.requiredPlayers})`,
        );
      }
      if (seenPositions.has(a.position)) {
        throw new BadRequestException(`Posición ${a.position} aparece dos veces`);
      }
      if (seenRegIds.has(a.registrationId)) {
        throw new BadRequestException(
          `La inscripción ${a.registrationId} aparece dos veces`,
        );
      }
      seenPositions.add(a.position);
      seenRegIds.add(a.registrationId);
    }

    await this.prisma.$transaction(
      assignments.map(({ registrationId, position }) =>
        this.prisma.matchRegistration.update({
          where: { id: registrationId },
          data: { position },
        }),
      ),
    );

    this.matchGateway.emitPlayersReordered(matchId);
    this.logger.log(`🔀 Plantilla reordenada en partido ${matchId} (${assignments.length} asignaciones)`);

    return { message: 'Orden actualizado', count: assignments.length };
  }
}
