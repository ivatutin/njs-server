import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Нарушен инвариант контактов: нет ни email, ни phone, либо попытка изменить
 * verified-контакт напрямую.
 * HTTP: 422. Контрактный код: `InvalidContacts` (реестр, контракт v1.1).
 */
export class InvalidContactsError extends RuleViolationError {
  readonly code = ErrorCode.INVALID_CONTACTS;

  constructor(message: string = 'User must have email or phone') {
    super(message);
  }
}
