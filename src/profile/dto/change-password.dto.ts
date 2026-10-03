import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual' })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'Nueva contraseña: mínimo 8, mayúscula, minúscula, número y símbolo',
    example: 'NuevaPass123!',
  })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'La contraseña debe tener mayúscula, minúscula, número y símbolo',
  })
  newPassword: string;
}
