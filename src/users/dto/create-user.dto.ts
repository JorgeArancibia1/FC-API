import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../common';

export class CreateUserDto {
  @ApiProperty({ example: 'Pablo' })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({ required: false, example: 'González' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({ example: 'pablo@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Test1234!',
    description: 'Mínimo 8 caracteres, mayúscula, minúscula, número y símbolo',
  })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'La contraseña debe tener mayúscula, minúscula, número y símbolo',
  })
  password: string;

  @ApiProperty({
    required: false,
    enum: UserRole,
    isArray: true,
    description: 'Roles iniciales. Si se omite, se asigna [usuario].',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  roles?: UserRole[];
}
