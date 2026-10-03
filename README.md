# FC — API

Backend NestJS + Prisma + MongoDB para inscripción a partidos de fútbol con realtime.

## Stack

- **NestJS 11** — framework HTTP + WebSocket
- **Prisma 6** + **MongoDB** — ORM y persistencia
- **JWT** (access 30 min + refresh 30 días con rotación + reuse detection)
- **bcrypt** (cost 12) — hashing de contraseñas
- **Socket.IO** — realtime para inscripciones en vivo
- **Google Cloud Storage** — fotos de perfil (signed URLs)

## Roles

| Rol         | Permisos                                                        |
| ----------- | --------------------------------------------------------------- |
| `admin`     | CRUD de partidos, asignación de roles, acceso total             |
| `supervisor`| Editar partidos                                                 |
| `usuario`   | Ver partidos, inscribirse y retirarse (rol por defecto)         |

## Setup

```bash
pnpm install           # o npm install
cp .env.example .env   # editar JWT_SECRET y DATABASE_URL
pnpm prisma:generate
pnpm prisma:db:push    # MongoDB requiere replica set para Prisma
pnpm start:dev
```

> **MongoDB local**: Prisma exige replica set incluso para una sola instancia. Si usas Docker:
> ```bash
> docker run -d -p 27017:27017 --name mongo-rs mongo:7 --replSet rs0
> docker exec -it mongo-rs mongosh --eval "rs.initiate()"
> ```
> Luego usa `DATABASE_URL=mongodb://localhost:27017/simonfc?replicaSet=rs0`.

## Endpoints principales

### Auth
- `POST /api/auth/register` — registrar nuevo jugador (rol `usuario`)
- `POST /api/auth/login` — devuelve `token` + `refreshToken`
- `POST /api/auth/refresh` — rotación de RT con reuse detection
- `POST /api/auth/revoke` — logout de dispositivo
- `POST /api/auth/revoke-all` — logout de todos los dispositivos
- `GET  /api/auth/verify` — valida token

### Profile
- `GET  /api/profile/me`
- `PATCH /api/profile/me` — actualizar nombre, camiseta, número, photoUrl

### Matches
- `GET  /api/matches` — listar partidos
- `GET  /api/matches/:id` — detalle con plantilla de inscritos
- `POST /api/matches` — crear partido (Admin)
- `PATCH /api/matches/:id` — editar (Admin / Supervisor)
- `DELETE /api/matches/:id` — eliminar (Admin)

### Registrations
- `POST   /api/matches/:matchId/register` — inscribirse
- `DELETE /api/matches/:matchId/register` — retirarse

### Storage
- `POST /api/storage/photo-upload-url` — genera signed URL para subir foto a GCS

### Realtime
Conexión: `io('http://localhost:3000/realtime', { auth: { token: '<jwt>' } })`

```ts
socket.emit('match:join', matchId);

socket.on('player.registered', ({ matchId, registration }) => { ... });
socket.on('player.unregistered', ({ matchId, userId }) => { ... });
```

## Documentación

Swagger en `http://localhost:3000/api/docs`.

## Características de seguridad

- bcrypt cost 12
- JWT con secret >= 32 chars (validación en `envs.ts`)
- Refresh token rotation + reuse detection (revoca toda la familia si se reusa un RT revocado)
- Rate limiting: 5/min login, 3/min register, 10/min refresh; 30/min global
- ValidationPipe global con `whitelist + forbidNonWhitelisted`
- CORS estricto con allowlist de orígenes en producción
# fc-api
