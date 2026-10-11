import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { AuthGuard, RolesGuard } from '../common/guards';
import { Roles, User } from '../common/decorators';
import { CurrentUser, UserRole } from '../common';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({
    summary: 'Listar usuarios (Admin/Developer)',
    description:
      'Por defecto devuelve todos. Con ?scope=invited un admin recibe solo los usuarios que aceptaron una invitación suya (el developer sigue viendo todos).',
  })
  findAll(@User() user: CurrentUser, @Query('scope') scope?: string) {
    return this.usersService.findAll(user, scope);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Crear usuario (Admin/Developer)' })
  create(@Body() dto: CreateUserDto, @User() user: CurrentUser) {
    return this.usersService.create(dto, user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Detalle de un usuario' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Actualizar roles, estado o datos básicos (Admin/Developer)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @User() user: CurrentUser) {
    return this.usersService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Soft-delete: marca al usuario como eliminado (Admin/Developer)' })
  remove(@Param('id') id: string, @User() user: CurrentUser) {
    return this.usersService.softDelete(id, user);
  }
}
