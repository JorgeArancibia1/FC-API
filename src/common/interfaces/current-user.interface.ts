import { UserRole } from '../enums';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  status?: string;
}
