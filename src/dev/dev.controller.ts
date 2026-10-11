import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevService } from './dev.service';
import { AuthGuard, RolesGuard } from '../common/guards';
import { Roles } from '../common/decorators';
import { UserRole } from '../common';

@ApiTags('Developer')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('dev')
export class DevController {
  constructor(private readonly devService: DevService) {}

  @Get('system')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Panel de configuración avanzada (solo Developer)' })
  system() {
    return this.devService.system();
  }
}
