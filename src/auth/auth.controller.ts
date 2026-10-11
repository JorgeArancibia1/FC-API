import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  ChangeRoleDto,
  ForgotPasswordDto,
  LoginUserDto,
  RecoverEmailDto,
  RefreshTokenDto,
  RegisterUserDto,
  ResetPasswordDto,
} from './dto';
import { Token, User } from '../common/decorators';
import { AuthGuard } from '../common/guards';
import { CurrentUser } from '../common/interfaces';

const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const REGISTER_THROTTLE = { default: { limit: 3, ttl: 60_000 } };
const REFRESH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
const RECOVERY_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(REGISTER_THROTTLE)
  @ApiOperation({ summary: 'Crear cuenta (rol inicial jugador o administrador)' })
  @ApiResponse({ status: 201, description: 'Usuario registrado' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  async register(@Body() dto: RegisterUserDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(@Body() dto: LoginUserDto) {
    return this.authService.login(dto);
  }

  @Get('verify')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar token actual' })
  async verify(@Token() token: string) {
    return this.authService.verifyToken(token);
  }

  @Post('refresh')
  @Throttle(REFRESH_THROTTLE)
  @ApiOperation({ summary: 'Renovar access token (rotación + reuse detection)' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(RECOVERY_THROTTLE)
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña por email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(RECOVERY_THROTTLE)
  @ApiOperation({ summary: 'Restablecer contraseña con el token del correo' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('recover-email')
  @HttpCode(HttpStatus.OK)
  @Throttle(RECOVERY_THROTTLE)
  @ApiOperation({ summary: 'Olvidé mi correo: recuperar emails por teléfono o pregunta secreta' })
  async recoverEmail(@Body() dto: RecoverEmailDto) {
    return this.authService.recoverEmail(dto);
  }

  @Post('change-role')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar mi rol (jugador ↔ administrador) desde el perfil' })
  async changeRole(@User() user: CurrentUser, @Body() dto: ChangeRoleDto) {
    return this.authService.changeRole(user.id, dto);
  }

  @Post('revoke')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revocar un refresh token (logout de dispositivo)' })
  async revoke(@Body() dto: RefreshTokenDto) {
    return this.authService.revokeRefreshToken(dto.refreshToken);
  }

  @Post('revoke-all')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revocar todas las sesiones del usuario' })
  async revokeAll(@User() user: CurrentUser) {
    return this.authService.revokeAllUserTokens(user.id);
  }
}
