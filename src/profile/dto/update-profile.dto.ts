import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  jerseyName?: string;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  preferredNumber?: number;

  @ApiProperty({
    required: false,
    description: 'URL de foto (absoluta o relativa /uploads/...)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  @ApiProperty({
    required: false,
    description: 'URL de foto hero cuerpo entero (absoluta o relativa /uploads/...)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  heroPhotoUrl?: string;
}
