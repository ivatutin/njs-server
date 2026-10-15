import { registerAs } from '@nestjs/config';

/**
 * Транзакционная почта (DashaMail HTTP API, ADR-0019).
 *
 * Ключ живёт только на бэкенде; формат провайдера не покидает адаптер
 * `DashaMailEmailSender`. Пусто (`apiKey` не задан) → `EMAIL_SENDER` работает
 * dev-реализацией (код в лог), а в production отказывает → `503` (fail-closed,
 * как звонковый канал при выключенном `SMSRU_CALLCHECK_ENABLED`).
 */
export default registerAs('dashamail', () => ({
  apiKey: process.env.DASHAMAIL_API_KEY ?? '',
  /**
   * Адрес отправителя. Домен обязан быть добавлен и подтверждён (DKIM + SPF),
   * иначе провайдер не отправит письмо и вернёт `code 34` (ADR-0019).
   */
  fromEmail: process.env.DASHAMAIL_FROM_EMAIL ?? '',
  fromName: process.env.DASHAMAIL_FROM_NAME || 'Video Service',
  /** База API: подменяется в тестах/локальных заглушках. */
  baseUrl: process.env.DASHAMAIL_API_BASE_URL || 'https://api.dashamail.com',
}));
