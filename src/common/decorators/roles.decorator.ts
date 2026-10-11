import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums';

export const ROLES_KEY = 'roles';

// Uso: @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
