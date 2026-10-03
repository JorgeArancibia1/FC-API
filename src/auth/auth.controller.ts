import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginUserDto, RefreshTokenDto, RegisterUserDto } from './dto';
import { Token, User } from '../common/decorators';
import { AuthGuard } from '../common/guards';
import { CurrentUser } from '../common/interfaces';

const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const REGISTER_THROTTLE = { default: { limit: 3, ttl: 60_000 } };
const REFRESH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(REGISTER_THROTTLE)
  @ApiOperation({ summary: 'Registrar nuevo jugador' })
  @ApiResponse({ status: 201, description: 'Usuario registrado' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  async register(@Body() dto: RegisterUserDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Login OK con token y refreshToken' })
  @ApiResponse({ status: 400, description: 'Credenciales inválidas' })
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
