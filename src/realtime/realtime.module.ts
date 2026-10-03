import { Module } from '@nestjs/common';
import { MatchGateway } from './match.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [MatchGateway],
  exports: [MatchGateway],
})
export class RealtimeModule {}
