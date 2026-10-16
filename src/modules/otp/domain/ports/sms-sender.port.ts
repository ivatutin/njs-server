import { OtpPurpose } from '../otp-policy';

export const SMS_SENDER = Symbol('SMS_SENDER');

/**
 * Отправка кода по SMS. В dev используется логирующая реализация,
 * в проде подключается провайдер (Twilio / SMS.ru) без изменений в application.
 */
export interface SmsSender {
  send(params: { target: string; code: string; purpose: OtpPurpose }): Promise<void>;

  /**
   * Служебное текстовое сообщение без кода (например, уведомление «контакт изменён», ADR-0017 §6).
   * Отдельный метод, а не `send` с текстом в поле `code`: смысл поля не размываем.
   * Отказ доставки не глушится здесь — решает вызывающий (уведомления best-effort).
   */
  sendText(params: { target: string; text: string }): Promise<void>;
}
