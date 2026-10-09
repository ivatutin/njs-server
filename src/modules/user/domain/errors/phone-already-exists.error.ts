import { ConflictError } from '@shared/domain/errors/conflict.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Phone уже зарегистрирован.
 * HTTP: 409. Контрактный код: `ContactAlreadyExists` (как и для email).
 */
export class PhoneAlreadyExistsError extends ConflictError {
  readonly code = ErrorCode.CONTACT_ALREADY_EXISTS;

  constructor() {
    super('Phone already exists');
  }
}
