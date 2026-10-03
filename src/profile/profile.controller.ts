import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
// multer no expone tipos vía pnpm strict; resolución por require evita el error TS7016.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const memoryStorage: () => unknown = require('multer').memoryStorage;
import { ProfileService } from './profile.service';
import { LocalPhotoUploader } from './local-photo-uploader';
import { ChangePasswordDto, UpdateProfileDto } from './dto';
import { AuthGuard } from '../common/guards';
import { User } from '../common/decorators';
import { CurrentUser } from '../common';

@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly localPhotoUploader: LocalPhotoUploader,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Obtener mi perfil' })
  getMe(@User() user: CurrentUser) {
    return this.profileService.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar mi perfil (nombre, camiseta, número, foto)' })
  updateMe(@User() user: CurrentUser, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateMe(user.id, dto);
  }

  @Post('me/change-password')
  @ApiOperation({
    summary: 'Cambiar mi contraseña (autoservicio). Requiere contraseña actual.',
  })
  changePassword(@User() user: CurrentUser, @Body() dto: ChangePasswordDto) {
    return this.profileService.changePassword(user.id, dto);
  }

  @Post('me/photo')
  @ApiOperation({
    summary: 'Subir foto de perfil (multipart). Reemplaza la actual.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
      required: ['photo'],
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 6 * 1024 * 1024 }, // 6MB hard limit (5MB validado dentro)
    }),
  )
  async uploadPhoto(
    @User() user: CurrentUser,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const publicUrl = await this.localPhotoUploader.save(user.id, file);
    return this.profileService.updateMe(user.id, { photoUrl: publicUrl });
  }

  @Post('me/hero-photo')
  @ApiOperation({
    summary: 'Subir foto hero de cuerpo entero (para el board estilo Velada). Reemplaza la actual.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
      required: ['photo'],
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 9 * 1024 * 1024 }, // 9MB hard limit (8MB validado dentro)
    }),
  )
  async uploadHeroPhoto(
    @User() user: CurrentUser,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const publicUrl = await this.localPhotoUploader.saveHero(user.id, file);
    return this.profileService.updateMe(user.id, { heroPhotoUrl: publicUrl });
  }
}
