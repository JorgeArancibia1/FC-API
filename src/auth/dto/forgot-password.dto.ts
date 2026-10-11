import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'koke@example.com' })
  @IsEmail()
  @MaxLength(100)
  email: string;
}
