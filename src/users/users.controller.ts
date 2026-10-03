import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Listar todos los usuarios (Admin/Supervisor)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear usuario con roles arbitrarios (Admin)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Detalle de un usuario' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar roles, estado o datos básicos (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @User() user: CurrentUser) {
    return this.usersService.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft-delete: marca al usuario como eliminado (Admin)' })
  remove(@Param('id') id: string, @User() user: CurrentUser) {
    return this.usersService.softDelete(id, user.id);
  }
}
