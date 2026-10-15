/**
 * Маскирование контактов для логов и ответов API.
 *
 * Plaintext-контакт не должен попадать ни в ответы (там маска из контракта, например
 * `+7 (***) ***-12-34`), ни в логи (PII). Живёт в shared, потому что маскирование нужно
 * и OTP-контексту (ответы `/auth/otp/*`), и auth-контексту (алерты смены контакта, ADR-0017).
 */

/**
 * Маскирует телефон в формате E.164: `+7 (***) ***-45-67` — видимыми остаются реальные
 * последние 4 цифры, по ним пользователь узнаёт свой номер.
 * Префикс — служебная часть до 10-значной национальной части номера.
 */
export function maskPhone(e164: string): string {
  const digits = e164.startsWith('+') ? e164.slice(1) : e164;
  if (digits.length < 5) return '***';

  const prefixLength = Math.max(1, digits.length - 10);
  const prefix = digits.slice(0, prefixLength);
  const national = digits.slice(prefixLength);
  const lastFour = national.slice(-4);

  return `+${prefix} (***) ***-${lastFour.slice(0, 2)}-${lastFour.slice(2)}`;
}

/** Маскирует email: домен остаётся видимым, локальная часть — первая буква и `***`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';

  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, 1)}***${domain}`;
}
