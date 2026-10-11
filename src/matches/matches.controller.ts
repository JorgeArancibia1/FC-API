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
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Crear partido (Admin/Developer)' })
  create(@Body() dto: CreateMatchDto, @User() user: CurrentUser) {
    return this.matchesService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los partidos' })
  findAll() {
    return this.matchesService.findAll();
  }

  @Get('mine')
  @ApiOperation({ summary: 'Partidos en los que estoy inscrito' })
  findMine(@User() user: CurrentUser) {
    return this.matchesService.findMine(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un partido con su plantilla' })
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Actualizar / cancelar / finalizar partido (Admin/Developer)' })
  update(@Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Eliminar partido (Admin/Developer)' })
  remove(@Param('id') id: string) {
    return this.matchesService.remove(id);
  }
}
