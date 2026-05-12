import { DomainError } from './domain.error';

/**
 * Сущность не найдена.
 * HTTP: 404 Not Found.
 */
export class EntityNotFoundError extends DomainError {}
