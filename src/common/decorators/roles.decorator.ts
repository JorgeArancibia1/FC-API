import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums';

export const ROLES_KEY = 'roles';

// Uso: @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
