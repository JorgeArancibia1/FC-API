import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { PhotoUploadRequestDto } from './dto/photo-upload-request.dto';
import { AuthGuard } from '../common/guards';
import { User } from '../common/decorators';
import { CurrentUser } from '../common';

@ApiTags('Storage')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('photo-upload-url')
  @ApiOperation({
    summary: 'Obtener signed URL para subir foto de perfil directo a GCS',
    description:
      'El cliente debe hacer PUT al uploadUrl con el archivo y el header Content-Type. Luego envía publicUrl al endpoint PATCH /profile/me.',
  })
  createPhotoUploadUrl(@User() user: CurrentUser, @Body() dto: PhotoUploadRequestDto) {
    return this.storageService.createPhotoUploadUrl(user.id, dto.contentType);
  }
}
