/**
 * Базовый класс для всех доменных ошибок.
 * Наследники: RuleViolationError, EntityNotFoundError, ConflictError,
 * UnauthorizedError, ForbiddenError.
 *
 * AllExceptionsFilter маппит DomainError-наследников в HTTP коды, а в поле
 * `error` ответа отдаёт `code` — строку транспортного контракта (ADR-0012).
 * Имя класса в контракт не попадает: `class OtpInvalidError` может отдавать
 * код `OtpInvalid`.
 */
export abstract class DomainError extends Error {
  /**
   * Строковый код ошибки для тела HTTP-ответа (поле `error`).
   *
   * Значение обязано совпадать с реестром {@link ErrorCode}, если клиент умеет
   * его разбирать: наследник переопределяет поле явно.
   *
   * По умолчанию код выводится из имени класса без суффикса `Error`
   * (`InvalidTokenError` → `InvalidToken`), поэтому промежуточные базовые
   * классы (`ConflictError`, `RuleViolationError`, …) остаются используемыми
   * без объявления поля.
   *
   * ```ts
   * class EmailAlreadyExistsError extends ConflictError {
   *   readonly code = ErrorCode.CONTACT_ALREADY_EXISTS; // 'ContactAlreadyExists'
   * }
   * ```
   */
  readonly code: string = this.constructor.name.replace(/Error$/, '');

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
