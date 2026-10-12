import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegistrationsService } from './registrations.service';
import { ReorderRegistrationsDto } from './dto/reorder-registrations.dto';
import { AddPlayerDto } from './dto/add-player.dto';
import { AuthGuard, RolesGuard } from '../common/guards';
import { Roles, User } from '../common/decorators';
import { CurrentUser, UserRole } from '../common';

@ApiTags('Registrations')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('matches/:matchId')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Inscribirse al partido' })
  register(@Param('matchId') matchId: string, @User() user: CurrentUser) {
    return this.registrationsService.register(matchId, user.id);
  }

  @Delete('register')
  @ApiOperation({ summary: 'Desinscribirse del partido' })
  unregister(@Param('matchId') matchId: string, @User() user: CurrentUser) {
    return this.registrationsService.unregister(matchId, user.id);
  }

  // --- Gestión de jugadores (Admin/Developer) -------------------------------

  @Post('players')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Inscribir a un jugador (Admin/Developer)' })
  adminAddPlayer(@Param('matchId') matchId: string, @Body() dto: AddPlayerDto) {
    return this.registrationsService.adminAddPlayer(matchId, dto.userId);
  }

  @Delete('players/:userId')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Quitar a un jugador del partido (Admin/Developer)' })
  adminRemovePlayer(
    @Param('matchId') matchId: string,
    @Param('userId') userId: string,
  ) {
    return this.registrationsService.adminRemovePlayer(matchId, userId);
  }

  // --- Orden de la plantilla ------------------------------------------------

  // Sin @Roles: cualquier usuario autenticado puede reordenar (dev, admin y
  // jugador). El AuthGuard del controlador sigue exigiendo sesión válida.
  @Patch('registrations/reorder')
  @ApiOperation({ summary: 'Reordenar la plantilla (autenticado)' })
  reorder(
    @Param('matchId') matchId: string,
    @Body() dto: ReorderRegistrationsDto,
  ) {
    return this.registrationsService.reorder(matchId, dto.assignments);
  }
}
