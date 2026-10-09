import { ConflictError } from '@shared/domain/errors/conflict.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Контакт уже зарегистрирован — отдаётся при `purpose = 'sign-up'`.
 * HTTP: 409. Код контракта общий для email и phone (`ContactAlreadyExists`),
 * поэтому класс локальный для контекста: user-модуль имеет свои
 * `EmailAlreadyExistsError` / `PhoneAlreadyExistsError` с тем же кодом.
 */
export class ContactAlreadyExistsError extends ConflictError {
  readonly code = ErrorCode.CONTACT_ALREADY_EXISTS;

  constructor() {
    super('Contact already exists');
  }
}
