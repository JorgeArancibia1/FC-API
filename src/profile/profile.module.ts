import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { LocalPhotoUploader } from './local-photo-uploader';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProfileController],
  providers: [ProfileService, LocalPhotoUploader],
})
export class ProfileModule {}
