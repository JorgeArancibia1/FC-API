import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InvitesService } from './invites.service';
import { AcceptInviteDto, ResolveCodeDto } from './dto';
import { AuthGuard, RolesGuard } from '../common/guards';
import { Roles, User } from '../common/decorators';
import { CurrentUser } from '../common/interfaces';
import { UserRole } from '../common';

const CODE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Invites')
@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('matches/:matchId/invites')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generar link + código de invitación para un partido' })
  create(@Param('matchId') matchId: string, @User() user: CurrentUser) {
    return this.invitesService.create(matchId, user);
  }

  @Get('invites/:token')
  @ApiOperation({ summary: 'Resolver un link de invitación (público)' })
  resolveByToken(@Param('token') token: string) {
    return this.invitesService.resolveByToken(token);
  }

  @Post('invites/code')
  @HttpCode(HttpStatus.OK)
  @Throttle(CODE_THROTTLE)
  @ApiOperation({ summary: 'Resolver un código de 6 dígitos (público)' })
  resolveByCode(@Body() dto: ResolveCodeDto) {
    return this.invitesService.resolveByCode(dto.code);
  }

  @Post('invites/accept')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unirse al partido de una invitación (requiere sesión)' })
  accept(@User() user: CurrentUser, @Body() dto: AcceptInviteDto) {
    return this.invitesService.accept(user, dto);
  }

  @Delete('invites/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revocar una invitación (autor o staff)' })
  revoke(@Param('id') id: string, @User() user: CurrentUser) {
    return this.invitesService.revoke(id, user);
  }

  @Post('platform-invites')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generar link + código de invitación a la plataforma (staff)' })
  createPlatform(@User() user: CurrentUser) {
    return this.invitesService.createPlatform(user);
  }

  @Get('platform-invites/:token')
  @ApiOperation({ summary: 'Resolver un link de invitación a la plataforma (público)' })
  resolvePlatformByToken(@Param('token') token: string) {
    return this.invitesService.resolvePlatformByToken(token);
  }

  @Post('platform-invites/code')
  @HttpCode(HttpStatus.OK)
  @Throttle(CODE_THROTTLE)
  @ApiOperation({ summary: 'Resolver un código de invitación a la plataforma (público)' })
  resolvePlatformByCode(@Body() dto: ResolveCodeDto) {
    return this.invitesService.resolvePlatformByCode(dto.code);
  }
}
