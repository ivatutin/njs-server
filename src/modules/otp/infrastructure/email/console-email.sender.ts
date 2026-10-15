import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '../../domain/otp-policy';
import { maskEmail } from '../../domain/target-mask';
import { EmailSendResult, EmailSender } from '../../domain/ports/email-sender.port';

/**
 * DEV/CI-реализация email-канала (ADR-0019): код печатается в лог — этого достаточно,
 * чтобы прогнать смену email локально и во фронтовых e2e, пока не выдан ключ DashaMail.
 *
 * В `NODE_ENV=production` канал **отказывает** (`accepted: false` → `503`): без
 * сконфигурированного `DASHAMAIL_API_KEY` письма не должны уходить «в никуда».
 * Поведение повторяет dev-провайдер звонка (`ConsolePhoneCallProvider`).
 */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);
  private readonly nodeEnv: string;

  constructor(config: ConfigService) {
    this.nodeEnv = config.get<string>('app.nodeEnv') ?? 'development';
  }

  async send(params: {
    target: string;
    code: string;
    purpose: OtpPurpose;
    messageId: string;
  }): Promise<EmailSendResult> {
    if (this.nodeEnv === 'production') {
      this.logger.error('DASHAMAIL_API_KEY is not configured — email delivery is unavailable');
      return { accepted: false, reason: 'not-configured' };
    }

    this.logger.log(
      `[dev-email] purpose=${params.purpose} to=${maskEmail(params.target)} ` +
        `message_id=${params.messageId} code=${params.code}`,
    );
    return { accepted: true };
  }
}
