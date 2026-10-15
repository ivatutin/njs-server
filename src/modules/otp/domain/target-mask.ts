/**
 * Маскирование телефона для ответа: клиент получает `+7 (***) ***-45-67`,
 * то есть формат из контракта (`+7 (***) ***-12-34` — шаблон), где видимыми
 * остаются реальные последние 4 цифры: по ним пользователь узнаёт свой номер.
 *
 * Plaintext-target в ответах и логах не появляется.
 * Префикс — служебная часть до 10-значной национальной части номера:
 * для `+7XXXXXXXXXX` это ожидаемое контрактом `+7`.
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

/**
 * Маскирование email для логов: домен остаётся видимым (по нему видно, чей это
 * почтовый провайдер), локальная часть — первая буква и `***`.
 *
 * Полный адрес получателя не должен попадать ни в ответы, ни в логи (PII, ADR-0019).
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';

  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, 1)}***${domain}`;
}
