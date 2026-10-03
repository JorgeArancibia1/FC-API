import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MatchStatus } from '@prisma/client';
import { CreateMatchDto } from './create-match.dto';

export class UpdateMatchDto extends PartialType(CreateMatchDto) {
  @ApiProperty({ enum: MatchStatus, required: false })
  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;
}
