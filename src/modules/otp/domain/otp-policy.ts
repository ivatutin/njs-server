/**
 * Политика OTP-сервиса: всё, что зафиксировано контрактом Auth v1 или ADR-0011
 * (6 цифр, TTL 5 минут, ≤5 попыток, rate-limit 3/час на target и 10/час на IP,
 * cooldown 60 c). Держим значения в одном месте, чтобы адаптеры и use cases
 * не расходились в цифрах.
 */

export type OtpChannel = 'phone';

/**
 * Сценарии, для которых выдаётся OTP. Список заморожен контрактом v1.0 —
 * расширение требует согласования (см. `docs/auth-v1-contract.md`).
 */
export const OTP_PURPOSES = [
  'sign-up',
  'sign-in',
  'verify-contact',
  'change-contact-old',
  'change-contact-new',
  'set-password',
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

/** Длина кода (всегда 6 цифр — фронт рендерит 6 сегментов). */
export const OTP_CODE_LENGTH = 6;

/** TTL челленджа: 5 минут (NIST SP 800-63B, ADR-0011). */
export const OTP_TTL_SECONDS = 300;

/** Максимум неверных попыток до лока челленджа. */
export const OTP_MAX_ATTEMPTS = 5;

/** Cooldown между отправками на один target. */
export const OTP_COOLDOWN_SECONDS = 60;

/** Rate-limit: не более 3 отправок в час на target. */
export const OTP_MAX_PER_TARGET_PER_HOUR = 3;

/** Rate-limit: не более 10 отправок в час с одного IP. */
export const OTP_MAX_PER_IP_PER_HOUR = 10;

/** TTL verificationToken, который выдаётся после успешного verify. */
export const VERIFICATION_TOKEN_TTL_SECONDS = 600;

export function isOtpPurpose(value: unknown): value is OtpPurpose {
  return typeof value === 'string' && (OTP_PURPOSES as readonly string[]).includes(value);
}
