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

const PLAYER_SELECT = {
  id: true,
  name: true,
  lastName: true,
  jerseyName: true,
  preferredNumber: true,
  photoUrl: true,
  heroPhotoUrl: true,
} as const;

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger('RegistrationsService');

  // Cola de locks en proceso, una por partido. Serializa el "chequeo de cupo +
  // alta" para que dos inscripciones simultáneas no superen `requiredPlayers`.
  // Es válido para un único proceso NestJS (el despliegue actual). Si algún día
  // se escala a varias instancias habría que sustituirlo por un lock
  // distribuido o por un contador atómico en la base.
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchGateway: MatchGateway,
  ) {}

  /** Ejecuta `fn` en exclusión mutua por partido (FIFO). */
  private async withMatchLock<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(matchId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prev.then(() => gate);
    this.locks.set(matchId, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(matchId) === chained) this.locks.delete(matchId);
    }
  }

  // --- Inscripción ---------------------------------------------------------

  /** Auto-inscripción. Solo permitida si el partido está abierto. */
  register(matchId: string, userId: string) {
    return this.addPlayer(matchId, userId, { adminOverride: false });
  }

  /** Alta manual de un jugador (Admin/Developer). Permite partidos cerrados. */
  adminAddPlayer(matchId: string, userId: string) {
    return this.addPlayer(matchId, userId, { adminOverride: true });
  }

  private async addPlayer(
    matchId: string,
    userId: string,
    opts: { adminOverride: boolean },
  ) {
    return this.withMatchLock(matchId, async () => {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: { _count: { select: { registrations: true } } },
      });

      if (!match) throw new NotFoundException(`Partido ${matchId} no encontrado`);

      const finished =
        match.status === MatchStatus.cancelled || match.status === MatchStatus.finished;
      if (finished) {
        throw new BadRequestException('El partido no está aceptando inscripciones');
      }
      if (!opts.adminOverride && match.status !== MatchStatus.open) {
        throw new BadRequestException('El partido no está aceptando inscripciones');
      }
      if (match._count.registrations >= match.requiredPlayers) {
        throw new BadRequestException('El cupo del partido está lleno');
      }

      const target = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });
      if (!target || target.status === 'eliminado') {
        throw new NotFoundException('Usuario no encontrado');
      }

      let registration;
      try {
        registration = await this.prisma.matchRegistration.create({
          data: { matchId, userId },
          include: { user: { select: PLAYER_SELECT } },
        });
      } catch (error) {
        if ((error as { code?: string })?.code === 'P2002') {
          throw new ConflictException('El jugador ya está inscrito en este partido');
        }
        throw error;
      }

      // Si tras esta inscripción se llenó el cupo, cerrar el partido.
      const newCount = match._count.registrations + 1;
      if (newCount >= match.requiredPlayers && match.status === MatchStatus.open) {
        await this.prisma.match.update({
          where: { id: matchId },
          data: { status: MatchStatus.closed },
        });
      }

      this.matchGateway.emitPlayerRegistered(matchId, registration);
      this.matchGateway.emitMatchesChanged({ matchId });
      this.logger.log(`✅ ${registration.user.name} inscrito al partido ${matchId}`);

      return registration;
    });
  }

  // --- Baja ----------------------------------------------------------------

  /** Auto-desinscripción. */
  unregister(matchId: string, userId: string) {
    return this.removePlayer(matchId, userId);
  }

  /** Baja manual de un jugador (Admin/Developer). */
  adminRemovePlayer(matchId: string, userId: string) {
    return this.removePlayer(matchId, userId);
  }

  private async removePlayer(matchId: string, userId: string) {
    return this.withMatchLock(matchId, async () => {
      const registration = await this.prisma.matchRegistration.findUnique({
        where: { matchId_userId: { matchId, userId } },
      });

      if (!registration) {
        throw new NotFoundException('El jugador no está inscrito en este partido');
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
      this.matchGateway.emitMatchesChanged({ matchId });
      this.logger.log(`👋 userId=${userId} se retiró del partido ${matchId}`);

      return { message: 'Inscripción cancelada' };
    });
  }

  // --- Reordenar equipos ---------------------------------------------------

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
    this.matchGateway.emitMatchesChanged({ matchId });
    this.logger.log(
      `🔀 Plantilla reordenada en partido ${matchId} (${assignments.length} asignaciones)`,
    );

    return { message: 'Orden actualizado', count: assignments.length };
  }
}
