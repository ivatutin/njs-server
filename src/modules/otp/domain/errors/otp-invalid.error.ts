import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/** Неверный OTP-код: попытка учтена, попыток осталось меньше. HTTP: 422. */
export class OtpInvalidError extends RuleViolationError {
  readonly code = ErrorCode.OTP_INVALID;

  constructor() {
    super('Invalid OTP code');
  }
}
