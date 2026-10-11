import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ required: false, description: 'Token del link de invitación' })
  @IsOptional()
  @IsString()
  @Length(10, 200)
  token?: string;

  @ApiProperty({ required: false, description: 'Código de 6 dígitos', example: '482910' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;
}
