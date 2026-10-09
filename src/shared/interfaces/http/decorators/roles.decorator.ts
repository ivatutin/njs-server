import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts access to users having at least one of the listed Keycloak realm roles.
 * См. `RolesGuard`; живёт в shared по тем же причинам, что и `@Public()`.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
