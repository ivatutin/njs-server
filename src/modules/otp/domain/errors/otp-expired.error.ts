import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/** Челлендж не найден или истёк его TTL. HTTP: 422. */
export class OtpExpiredError extends RuleViolationError {
  readonly code = ErrorCode.OTP_EXPIRED;

  constructor() {
    super('OTP challenge expired or not found');
  }
}
