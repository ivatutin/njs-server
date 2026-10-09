import { Injectable, Logger } from '@nestjs/common';
import { SmsSender } from '../../domain/ports/sms-sender.port';
import { OtpPurpose } from '../../domain/otp-policy';
import { maskPhone } from '../../domain/target-mask';

/**
 * DEV-реализация SMS: код печатается в лог (нужен для smoke-проверки
 * `curl`-сценария из чек-листа). Plaintext-код в ответе API не отдаём.
 *
 * В проде биндинг `SMS_SENDER` заменяется на провайдера (Twilio / SMS.ru)
 * без изменений в application-слое.
 */
@Injectable()
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger(ConsoleSmsSender.name);

  async send(params: { target: string; code: string; purpose: OtpPurpose }): Promise<void> {
    this.logger.log(
      `[dev-sms] purpose=${params.purpose} to=${maskPhone(params.target)} code=${params.code}`,
    );
  }
}
