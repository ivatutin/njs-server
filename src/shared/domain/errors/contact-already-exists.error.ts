import { ConflictError } from './conflict.error';
import { ErrorCode } from './error-code';

/**
 * Контакт (email или phone) уже зарегистрирован. HTTP: 409.
 *
 * Код контракта общий для обоих каналов — канал клиент различает по полю формы.
 * Живёт в shared, потому что ошибку отдают несколько контекстов (auth — sign-up,
 * otp — проверка занятости номера); при этом собственные классы user-модуля
 * (`EmailAlreadyExistsError`, `PhoneAlreadyExistsError`) остаются типизированными
 * внутри своего контекста.
 */
export class ContactAlreadyExistsError extends ConflictError {
  readonly code = ErrorCode.CONTACT_ALREADY_EXISTS;

  constructor(message: string = 'Contact already exists') {
    super(message);
  }
}
