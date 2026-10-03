import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { CustomThrottlerGuard, HttpExceptionFilter } from './common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MatchesModule } from './matches/matches.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ProfileModule } from './profile/profile.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { envs } from './config/envs';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: envs.throttleTtl, limit: envs.throttleLimit }]),
    PrismaModule,
    AuthModule,
    RealtimeModule,
    MatchesModule,
    RegistrationsModule,
    ProfileModule,
    StorageModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
