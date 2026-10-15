import { OtpPurpose } from '../otp-policy';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/**
 * Доставка OTP-кода по email (ADR-0019).
 *
 * Отдельный канал от `SmsSender`, потому что письма уходят другим провайдером
 * (DashaMail HTTP API в проде, лог в dev) и с другой семантикой: доставка
 * **асинхронная**, поэтому постановка письма в очередь не гейтит `request` —
 * проверяем только то, что провайдер письмо принял.
 */
export interface EmailSender {
  /**
   * @param messageId наш идентификатор письма (корреляция с записью `contact-change`
   *                  и идемпотентность провайдера). Чужие `transaction_id` не храним.
   * @returns `accepted: false` — канал недоступен (не сконфигурирован либо провайдер
   *          отказал после ретраев); вызывающая сторона отвечает `503`, ничего не применяя.
   */
  send(params: {
    target: string;
    code: string;
    purpose: OtpPurpose;
    messageId: string;
  }): Promise<EmailSendResult>;
}

export interface EmailSendResult {
  accepted: boolean;
  /** Причина отказа — для логов и алертов, наружу не уходит. */
  reason?: 'not-configured' | 'provider-error';
}
