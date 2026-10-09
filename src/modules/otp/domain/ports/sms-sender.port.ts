import { OtpPurpose } from '../otp-policy';

export const SMS_SENDER = Symbol('SMS_SENDER');

/**
 * Отправка кода по SMS. В dev используется логирующая реализация,
 * в проде подключается провайдер (Twilio / SMS.ru) без изменений в application.
 */
export interface SmsSender {
  send(params: { target: string; code: string; purpose: OtpPurpose }): Promise<void>;
}
