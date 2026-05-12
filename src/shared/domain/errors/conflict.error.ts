import { DomainError } from './domain.error';

/**
 * Конфликт с текущим состоянием системы (дубликат уникального значения и т.п.).
 * HTTP: 409 Conflict.
 */
export class ConflictError extends DomainError {}
