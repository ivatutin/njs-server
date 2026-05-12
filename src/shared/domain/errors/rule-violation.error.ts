import { DomainError } from './domain.error';

/**
 * Нарушение бизнес-правила или инварианта.
 * HTTP: 422 Unprocessable Entity.
 *
 * Примеры:
 * - попытка suspended → suspend
 * - попытка activate без verified контактов
 * - попытка сменить verified email напрямую
 * - невалидный формат значения (email/phone/uuid) если прошёл мимо DTO
 */
export class RuleViolationError extends DomainError {}
