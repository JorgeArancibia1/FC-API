import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AddPlayerDto {
  @ApiProperty({ description: 'ID del usuario a inscribir en el partido' })
  @IsString()
  @Length(24, 24)
  userId: string;
}
