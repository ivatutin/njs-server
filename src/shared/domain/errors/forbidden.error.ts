import { DomainError } from './domain.error';

/**
 * Caller is authenticated but lacks permission for the requested action.
 * HTTP: 403 Forbidden.
 */
export class ForbiddenError extends DomainError {}
