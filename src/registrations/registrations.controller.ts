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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirarse del partido' })
  unregister(@Param('matchId') matchId: string, @User() user: CurrentUser) {
    return this.registrationsService.unregister(matchId, user.id);
  }

  @Patch('registrations/reorder')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({
    summary:
      'Reordenar la plantilla (admin/supervisor). Acepta asignaciones parciales {registrationId, position}.',
  })
  reorder(
    @Param('matchId') matchId: string,
    @Body() dto: ReorderRegistrationsDto,
  ) {
    return this.registrationsService.reorder(matchId, dto.assignments);
  }
}
