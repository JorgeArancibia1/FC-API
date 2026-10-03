import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateMatchDto {
  @ApiProperty({ example: 'Centro deportivo Laurita Vicuña' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  place: string;

  @ApiProperty({ example: '2026-06-25T20:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  dateTime: Date;

  @ApiProperty({ example: 14, description: 'Cupo total de jugadores' })
  @IsInt()
  @Min(2)
  @Max(40)
  requiredPlayers: number;

  @ApiProperty({ example: 'Traer pechera blanca', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
