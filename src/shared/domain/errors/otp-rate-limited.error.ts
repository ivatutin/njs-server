import { ErrorCode } from './error-code';
import { RuleViolationError } from './rule-violation.error';

/**
 * Превышен лимит отправок (cooldown / per-target / per-IP) или лимит смен на пользователя.
 * HTTP: 422. Контракт требует `details.retryAfter` — сколько секунд ждать.
 *
 * Живёт в shared, потому что код используют два контекста: OTP-флоу (`/auth/otp/*`) и
 * внутренние лимиты смены контакта (ADR-0017 §7, I8) — код ошибки на проводе один.
 */
export class OtpRateLimitedError extends RuleViolationError {
  readonly code = ErrorCode.OTP_RATE_LIMITED;

  constructor(retryAfterSeconds: number) {
    super('Too many OTP requests', { retryAfter: retryAfterSeconds });
  }
}
