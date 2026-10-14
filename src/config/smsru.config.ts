import { registerAs } from '@nestjs/config';

/**
 * Провайдер подтверждения номера обратным звонком (SMS.ru callcheck, ADR-0014).
 *
 * Секрет (`api_id`) живёт только на бэкенде; формат провайдера не покидает
 * инфраструктурный адаптер `SmsRuCallcheckProvider`.
 */
export default registerAs('smsru', () => ({
  apiId: process.env.SMSRU_API_ID ?? '',
  /** Боевой канал включён? false → dev-заглушка (ADR-0014). */
  callcheckEnabled: process.env.SMSRU_CALLCHECK_ENABLED === 'true',
  /** База API провайдера: подменяется в тестах/локальных заглушках. */
  baseUrl: process.env.SMSRU_API_BASE_URL || 'https://sms.ru',
  /** Dev-заглушка: через сколько секунд «звонок» считается подтверждённым. */
  devConfirmAfterSeconds: parseInt(process.env.SMSRU_DEV_CONFIRM_AFTER_SECONDS || '15', 10),
}));
