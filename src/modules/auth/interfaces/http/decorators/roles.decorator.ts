import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'auth:roles';

/** Restricts access to users having at least one of the listed Keycloak realm roles. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
