import { DomainError } from './domain.error';

/**
 * Caller is not authenticated (no credentials / invalid credentials /
 * invalid or revoked token). HTTP: 401 Unauthorized.
 */
export class UnauthorizedError extends DomainError {}
