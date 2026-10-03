import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { envs } from '../config/envs';
import { CurrentUser } from '../common';

// Patrón: WebSocket Gateway autenticado.
// El cliente envía el JWT en handshake.auth.token al conectar:
//   io(url, { auth: { token: 'Bearer <jwt>' } })
// El cliente se suscribe a un partido con: socket.emit('match:join', matchId)
// El gateway emite 'player.registered' / 'player.unregistered' al room match:{id}.
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/realtime',
})
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('MatchGateway');

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const rawToken = (client.handshake.auth?.token ?? client.handshake.headers?.authorization) as
        | string
        | undefined;

      if (!rawToken) {
        this.logger.warn(`Conexión sin token rechazada: ${client.id}`);
        client.disconnect(true);
        return;
      }

      const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;
      const payload = this.jwtService.verify(token, { secret: envs.jwtSecret });

      const user: CurrentUser = {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        roles: payload.roles,
        status: payload.status,
      };

      (client.data as any).user = user;
      this.logger.log(`🔌 Conectado userId=${user.id} socketId=${client.id}`);
    } catch (error) {
      this.logger.warn(`Handshake JWT inválido: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as any)?.user?.id;
    this.logger.log(`🔌 Desconectado userId=${userId} socketId=${client.id}`);
  }

  @SubscribeMessage('match:join')
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() matchId: string) {
    if (!matchId || typeof matchId !== 'string') return { ok: false };
    client.join(this.room(matchId));
    return { ok: true, room: this.room(matchId) };
  }

  @SubscribeMessage('match:leave')
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() matchId: string) {
    if (!matchId || typeof matchId !== 'string') return { ok: false };
    client.leave(this.room(matchId));
    return { ok: true };
  }

  // ============================================================================
  // API hacia services (RegistrationsService llama estos métodos)
  // ============================================================================

  emitPlayerRegistered(matchId: string, registration: unknown) {
    this.server.to(this.room(matchId)).emit('player.registered', { matchId, registration });
  }

  emitPlayerUnregistered(matchId: string, userId: string) {
    this.server.to(this.room(matchId)).emit('player.unregistered', { matchId, userId });
  }

  emitPlayersReordered(matchId: string) {
    // El cliente reacciona refetcheando el match (más simple y robusto que
    // mandar el nuevo orden — evita conflictos si llegan eventos cruzados).
    this.server.to(this.room(matchId)).emit('players.reordered', { matchId });
  }

  private room(matchId: string) {
    return `match:${matchId}`;
  }
}
