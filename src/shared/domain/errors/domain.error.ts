/**
 * Базовый класс для всех доменных ошибок.
 * Наследники: RuleViolationError, EntityNotFoundError, ConflictError.
 *
 * AllExceptionsFilter маппит DomainError-наследников в HTTP коды.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
