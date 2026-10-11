import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterUserDto {
  @ApiProperty({ example: 'Koke', description: 'Nombre del jugador' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'González', description: 'Apellido del jugador', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({ example: 'KOKE', description: 'Nombre que aparece en la camiseta', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  jerseyName?: string;

  @ApiProperty({ example: 10, description: 'Número preferido (1–99)', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  preferredNumber?: number;

  @ApiProperty({ example: 'koke@example.com', description: 'Email único' })
  @IsEmail()
  @MaxLength(100)
  email: string;

  @ApiProperty({
    required: false,
    enum: ['usuario', 'admin'],
    description:
      'Rol inicial elegido al crear la cuenta. "admin" = quiero administrar partidos, "usuario" = quiero jugar.',
    example: 'usuario',
  })
  @IsOptional()
  @IsIn(['usuario', 'admin'])
  role?: 'usuario' | 'admin';

  @ApiProperty({
    required: false,
    example: '+56912345678',
    description: 'Teléfono (para el flujo "olvidé mi correo")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({
    required: false,
    example: '¿Cuál es tu equipo favorito?',
    description: 'Pregunta de seguridad (para "olvidé mi correo")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  securityQuestion?: string;

  @ApiProperty({
    required: false,
    example: 'Colo-Colo',
    description: 'Respuesta de seguridad. Se guarda hasheada.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  securityAnswer?: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Mínimo 8 caracteres, mayúscula, minúscula, número y símbolo',
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128)
  @Matches(/[a-z]/, { message: 'La contraseña debe contener al menos una letra minúscula' })
  @Matches(/[A-Z]/, { message: 'La contraseña debe contener al menos una letra mayúscula' })
  @Matches(/\d/, { message: 'La contraseña debe contener al menos un número' })
  @Matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, {
    message: 'La contraseña debe contener al menos un carácter especial',
  })
  password: string;

  @ApiProperty({
    required: false,
    description:
      'Token del link de invitación a la plataforma (?invitacion=...). Atribuye la cuenta a quien invitó.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  platformInviteToken?: string;

  @ApiProperty({
    required: false,
    example: '123456',
    description: 'Código de invitación a la plataforma (6 dígitos). Alternativa al link.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código de invitación debe tener 6 dígitos' })
  platformInviteCode?: string;
}
