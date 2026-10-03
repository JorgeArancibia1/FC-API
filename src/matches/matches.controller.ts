import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { CreateMatchDto, UpdateMatchDto } from './dto';
import { AuthGuard, RolesGuard } from '../common/guards';
import { Roles, User } from '../common/decorators';
import { CurrentUser, UserRole } from '../common';

@ApiTags('Matches')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear partido (solo Admin)' })
  create(@Body() dto: CreateMatchDto, @User() user: CurrentUser) {
    return this.matchesService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los partidos' })
  findAll() {
    return this.matchesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un partido con su plantilla' })
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Actualizar partido (Admin o Supervisor)' })
  update(@Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar partido (solo Admin)' })
  remove(@Param('id') id: string) {
    return this.matchesService.remove(id);
  }
}
