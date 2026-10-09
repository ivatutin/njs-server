import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/** Исчерпаны попытки ввода — челлендж залочен, нужен resend. HTTP: 422. */
export class OtpTooManyAttemptsError extends RuleViolationError {
  readonly code = ErrorCode.OTP_TOO_MANY_ATTEMPTS;

  constructor() {
    super('Too many attempts, request a new code');
  }
}
