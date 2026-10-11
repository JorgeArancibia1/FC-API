import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Flujo "olvidé mi correo": el usuario aporta teléfono O pregunta+respuesta de
// seguridad y el sistema devuelve los correos asociados.
export class RecoverEmailDto {
  @ApiProperty({ required: false, example: '+56912345678' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ required: false, example: '¿Nombre de tu primera mascota?' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  securityQuestion?: string;

  @ApiProperty({ required: false, example: 'Firulais' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  securityAnswer?: string;
}
