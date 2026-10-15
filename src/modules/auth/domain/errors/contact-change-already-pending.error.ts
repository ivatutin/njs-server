import { ErrorCode } from '@shared/domain/errors/error-code';
import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';

/**
 * У пользователя уже есть активная смена контакта (ADR-0017 §5: одна на пользователя).
 * Штатный путь для фронта — `cancel`, затем `request` заново.
 * HTTP: 422. Контрактный код: `ContactChangeAlreadyPending` (контракт v1.3).
 */
export class ContactChangeAlreadyPendingError extends RuleViolationError {
  readonly code = ErrorCode.CONTACT_CHANGE_ALREADY_PENDING;

  constructor(message: string = 'Contact change is already pending') {
    super(message);
  }
}
