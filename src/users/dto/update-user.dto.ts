import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../common';

export class UpdateUserDto {
  @ApiProperty({ required: false, example: 'Jorge' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiProperty({ required: false, example: 'Arancibia' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({
    required: false,
    enum: UserRole,
    isArray: true,
    description: 'Roles del usuario. Reemplaza la lista completa.',
    example: [UserRole.ADMIN, UserRole.USUARIO],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  roles?: UserRole[];

  @ApiProperty({
    required: false,
    enum: ['activo', 'suspendido'],
    description: 'Estado de la cuenta. "eliminado" se setea vía DELETE.',
  })
  @IsOptional()
  @IsIn(['activo', 'suspendido'])
  status?: 'activo' | 'suspendido';

  @ApiProperty({
    required: false,
    description:
      'Nueva contraseña del usuario (admin-set, no requiere la actual). Si se omite, no cambia. Min 8, mayús+minús+número+símbolo.',
    example: 'NuevaPass123!',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'La contraseña debe tener mayúscula, minúscula, número y símbolo',
  })
  password?: string;
}
