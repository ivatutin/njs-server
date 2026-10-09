import { ConflictError } from '@shared/domain/errors/conflict.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Email уже зарегистрирован.
 * HTTP: 409. Контрактный код: `ContactAlreadyExists` — клиент различает канал
 * по полю формы, а не по строке ошибки.
 */
export class EmailAlreadyExistsError extends ConflictError {
  readonly code = ErrorCode.CONTACT_ALREADY_EXISTS;

  constructor() {
    super('Email already exists');
  }
}
