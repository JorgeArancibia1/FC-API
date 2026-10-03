import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // CORS — localhost/LAN en dev + orígenes explícitos de CORS_ALLOWED_ORIGINS en prod.
    const productionOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const devOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/;

    app.useBodyParser('json', { limit: '5mb' });
    app.useBodyParser('urlencoded', { limit: '5mb', extended: true });

    app.enableCors({
      origin: [devOriginRegex, ...productionOrigins],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });

    app.setGlobalPrefix('api', {
      // Servir /uploads/* sin el prefijo /api.
      exclude: ['uploads/(.*)'],
    });

    // Archivos subidos por el LocalPhotoUploader (servidos estáticamente).
    // Cache immutable de 1 año: las URLs llevan UUID, así que un upload nuevo
    // genera una URL distinta y el cliente nunca sirve contenido stale.
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Simón FC API')
      .setDescription(
        '## API para inscripción a partidos de fútbol\n\n' +
          '### Autenticación\n' +
          '1. Registra usuario en `POST /api/auth/register`\n' +
          '2. Login en `POST /api/auth/login` — recibes `token` (30 min) y `refreshToken` (30 días)\n' +
          '3. Usa el token con Authorize\n\n' +
          '### Realtime\n' +
          'Conecta a `/realtime` con `io(url + "/realtime", { auth: { token: <jwt> } })`. ' +
          'Suscríbete a un partido: `socket.emit("match:join", matchId)`. ' +
          'Escucha eventos: `player.registered` y `player.unregistered`.\n\n' +
          '### Roles\n' +
          '- `admin`: CRUD de partidos + acceso total\n' +
          '- `supervisor`: edita partidos\n' +
          '- `usuario`: ve partidos y se inscribe/retira',
      )
      .setVersion('0.1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      })
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    });

    const prismaService = app.get(PrismaService);
    await prismaService.enableShutdownHooks(app);

    await app.listen(envs.port);

    logger.log(`✅ Simón FC API en http://localhost:${envs.port}/api`);
    logger.log(`📚 Swagger en http://localhost:${envs.port}/api/docs`);
    logger.log(`📡 WebSocket en ws://localhost:${envs.port}/realtime`);
  } catch (error) {
    logger.error(`❌ Error al iniciar: ${(error as Error).message}`);
    process.exit(1);
  }
}

bootstrap();
