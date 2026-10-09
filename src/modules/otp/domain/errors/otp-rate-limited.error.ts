import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Превышен лимит отправок (cooldown / per-target / per-IP). HTTP: 422.
 * Контракт требует `details.retryAfter` — сколько секунд ждать.
 */
export class OtpRateLimitedError extends RuleViolationError {
  readonly code = ErrorCode.OTP_RATE_LIMITED;

  constructor(retryAfterSeconds: number) {
    super('Too many OTP requests', { retryAfter: retryAfterSeconds });
  }
}
