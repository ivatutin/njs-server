export const PASSWORD_RESET_RATE_LIMITER = Symbol('PASSWORD_RESET_RATE_LIMITER');

/** Решение по лимиту: либо пропускаем, либо говорим, сколько секунд ждать. */
export type PasswordResetLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Лимит запросов сброса пароля: 3 в час на адрес (чек-лист Phase 1.5).
 *
 * На решение нельзя опираться в ответе: `POST /auth/forgot-password` **всегда**
 * отдаёт 202 (anti-enumeration), поэтому превышение лимита просто означает
 * «письмо не отправляем».
 */
export interface PasswordResetRateLimiter {
  consume(email: string): Promise<PasswordResetLimitDecision>;
}
