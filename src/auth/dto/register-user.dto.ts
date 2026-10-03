import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
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
}
