import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class RegistrationPositionAssignmentDto {
  @ApiProperty({ description: 'ID de la MatchRegistration' })
  @IsString()
  registrationId: string;

  @ApiProperty({ description: 'Posición absoluta (1..requiredPlayers)' })
  @IsInt()
  @Min(1)
  position: number;
}

export class ReorderRegistrationsDto {
  @ApiProperty({
    description: 'Asignaciones de posición. Solo se envían las que cambian.',
    type: [RegistrationPositionAssignmentDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RegistrationPositionAssignmentDto)
  assignments: RegistrationPositionAssignmentDto[];
}
