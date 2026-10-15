import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { OtpPurpose } from '../../domain/otp-policy';
import { EmailSendResult, EmailSender } from '../../domain/ports/email-sender.port';

/**
 * Ответ провайдера (подтверждено документацией DashaMail 15.10.2026):
 * `{ response: { msg: { err_code, text }, data: { transaction_id } } }`.
 * `err_code = 0` — письмо принято; `data.transaction_id` — эхо нашего `message_id`
 * (свой id передаём мы, поэтому чужой не храним).
 */
interface TransactionalMessageResponse {
  response?: {
    msg?: { err_code?: number; text?: string };
    data?: { transaction_id?: string };
  };
}

function subjectFor(purpose: OtpPurpose): string {
  switch (purpose) {
    case 'change-contact-new':
      return 'Подтверждение нового контакта';
    case 'change-contact-old':
      return 'Подтверждение смены контакта';
    case 'set-password':
      return 'Установка пароля';
    default:
      return 'Код подтверждения';
  }
}

/**
 * Текст письма. В письмо не подставляются данные пользователя — только код и
 * фиксированный текст (HTML собираем сами, инъекции взяться неоткуда).
 */
function buildBodies(purpose: OtpPurpose, code: string): { message: string; plain_text: string } {
  const intro = subjectFor(purpose);
  const tail = 'Код действует 5 минут. Если вы не запрашивали смену — просто проигнорируйте письмо.';

  return {
    message: `<p>${intro}</p><p>Ваш код: <b>${code}</b></p><p>${tail}</p>`,
    plain_text: `${intro}\n\nВаш код: ${code}\n${tail}`,
  };
}

function describe(cause: unknown): string {
  if (axios.isAxiosError(cause)) {
    return `status=${cause.response?.status ?? 'n/a'} ${cause.code ?? cause.message}`;
  }
  return cause instanceof Error ? cause.message : 'unknown error';
}

/**
 * Боевой email-канал: DashaMail, транзакционный HTTP API v2 (ADR-0019).
 *
 * Реализация учитывает требования ADR-0019:
 * - **свой `message_id`** в теле — корреляция с записью `contact-change` и идемпотентность
 *   на стороне провайдера; чужие `transaction_id` не храним;
 * - заголовок **`X-Dashamail-Unsub-Ignore: 1`** — OTP это служебное письмо, его нельзя
 *   терять из-за отписки/жалобы получателя (иначе запрос «успешен», а письмо получает
 *   `Bounced` (код 673) и событие `dropped`);
 * - доставка **асинхронная**: приняли в очередь → `accepted: true`, `request` не ждёт доставки;
 * - таймаут 5 с и до 3 попыток на сетевые сбои/5xx; 4xx не ретраим;
 * - адрес получателя в логи не пишем (PII) — только коды провайдера и наш `message_id`.
 */
@Injectable()
export class DashaMailEmailSender implements EmailSender {
  private static readonly TIMEOUT_MS = 5_000;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_MS = 250;

  private readonly logger = new Logger(DashaMailEmailSender.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('dashamail.apiKey') ?? '';
    this.fromEmail = config.get<string>('dashamail.fromEmail') ?? '';
    this.fromName = config.get<string>('dashamail.fromName') ?? 'Video Service';
    this.baseUrl = config.get<string>('dashamail.baseUrl') ?? 'https://api.dashamail.com';
  }

  async send(params: {
    target: string;
    code: string;
    purpose: OtpPurpose;
    messageId: string;
  }): Promise<EmailSendResult> {
    if (!this.apiKey || !this.fromEmail) {
      this.logger.error(
        'DASHAMAIL_API_KEY / DASHAMAIL_FROM_EMAIL is not configured — email delivery is unavailable',
      );
      return { accepted: false, reason: 'not-configured' };
    }

    const bodies = buildBodies(params.purpose, params.code);
    const body = {
      message_id: params.messageId,
      from_email: this.fromEmail,
      from_name: this.fromName,
      to: params.target,
      subject: subjectFor(params.purpose),
      // Провайдер требует HTML-версию (`message`) + plain-text (`plain_text`).
      message: bodies.message,
      plain_text: bodies.plain_text,
    };

    for (let attempt = 1; attempt <= DashaMailEmailSender.MAX_ATTEMPTS; attempt += 1) {
      try {
        const { data } = await axios.post<TransactionalMessageResponse>(
          `${this.baseUrl}/v2/transactional/messages`,
          body,
          {
            timeout: DashaMailEmailSender.TIMEOUT_MS,
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              // Служебное письмо с кодом: отписка получателя не должна его блокировать.
              'X-Dashamail-Unsub-Ignore': '1',
            },
          },
        );

        const errCode = data.response?.msg?.err_code;

        // Незнакомая форма ответа — тоже отказ: иначе «успех» будет ложным и код не уедет.
        if (errCode === undefined) {
          this.logger.error(
            `dashamail returned an unexpected response shape message_id=${params.messageId}`,
          );
          return { accepted: false, reason: 'provider-error' };
        }

        if (errCode !== 0) {
          // 34 — домен отправителя не подтверждён (DKIM/SPF), 673 — адрес отписан/пожаловался.
          this.logger.error(
            `dashamail rejected message_id=${params.messageId}: err_code=${errCode} ${data.response?.msg?.text ?? ''}`,
          );
          return { accepted: false, reason: 'provider-error' };
        }

        return { accepted: true };
      } catch (cause) {
        const retriable =
          axios.isAxiosError(cause) &&
          (cause.response === undefined || (cause.response.status ?? 0) >= 500);

        if (!retriable || attempt === DashaMailEmailSender.MAX_ATTEMPTS) {
          this.logger.error(
            `dashamail send failed message_id=${params.messageId} (attempt ${attempt}): ${describe(cause)}`,
          );
          return { accepted: false, reason: 'provider-error' };
        }

        this.logger.warn(
          `dashamail send attempt ${attempt} failed (retrying): ${describe(cause)}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, DashaMailEmailSender.RETRY_DELAY_MS * attempt),
        );
      }
    }

    return { accepted: false, reason: 'provider-error' };
  }
}
