import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ResolveCodeDto {
  @ApiProperty({ example: '482910', description: 'Código de 6 dígitos' })
  @IsString()
  @Length(6, 6)
  code: string;
}
