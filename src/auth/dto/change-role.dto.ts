import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// Cambio de rol autoservicio desde el perfil (jugador ↔ administrador).
export class ChangeRoleDto {
  @ApiProperty({ enum: ['usuario', 'admin'], example: 'admin' })
  @IsIn(['usuario', 'admin'])
  role: 'usuario' | 'admin';
}
