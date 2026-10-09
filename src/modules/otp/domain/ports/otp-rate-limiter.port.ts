export const OTP_RATE_LIMITER = Symbol('OTP_RATE_LIMITER');

/** Решение по лимитам: либо пропускаем, либо сообщаем, сколько секунд ждать. */
export type OtpRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Лимиты отправки OTP: cooldown на target, N в час на target, M в час на IP.
 * Реализация — счётчики в Redis с TTL.
 */
export interface OtpRateLimiter {
  consume(params: { target: string; ip?: string | null }): Promise<OtpRateLimitDecision>;
}
