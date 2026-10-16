import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ContactChangeNotifier } from '@shared/application/contact-change-notifier.interface';
import { maskEmail, maskPhone } from '@shared/domain/target-mask';
import { EMAIL_SENDER, EmailSender } from '../../domain/ports/email-sender.port';
import { SMS_SENDER, SmsSender } from '../../domain/ports/sms-sender.port';

/**
 * Реализация shared-порта `CONTACT_CHANGE_NOTIFIER` (ADR-0017 §6, I1) на существующих каналах:
 * SMS уходят через `SmsSender`, письма — через `EmailSender`.
 *
 * Уведомление идёт на **новый** контакт и на **прежний** (если он был): пользователь, который
 * не менял контакт, увидит это письмом/SMS и сможет отреагировать — дешёвый контроль против
 * незаметного угона. Оба сообщения — служебные, без ссылок и без данных аккаунта.
 *
 * Best-effort: смена уже применена, поэтому ошибки доставки логируются, а не поднимаются
 * вызывающему (иначе успешный `verify` превращался бы в `503`).
 */
@Injectable()
export class ContactChangeNotifierAdapter implements ContactChangeNotifier {
  private static readonly SUBJECT = 'Контакт изменён';
  private static readonly TEXT =
    'Контакт в вашем аккаунте изменён. Если это были не вы — обратитесь в поддержку.';

  private readonly logger = new Logger(ContactChangeNotifierAdapter.name);

  constructor(
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async notifyChanged(params: {
    keycloakId: string;
    channel: 'email' | 'phone';
    newValue: string;
    oldValue: string | null;
  }): Promise<void> {
    const kcShort = params.keycloakId.substring(0, 8);

    // Новый контакт — основной адресат: сообщаем, что смена выполнена.
    await this.deliver(params.channel, params.newValue, 'new');

    // Прежний контакт — второй адресат (если контакт был): сообщаем, что он больше не привязан.
    if (params.oldValue !== null && params.oldValue !== '') {
      await this.deliver(params.channel, params.oldValue, 'old');
    }

    this.logger.log(`contact-change notified kc=${kcShort}... channel=${params.channel}`);
  }

  private async deliver(
    channel: 'email' | 'phone',
    target: string,
    audience: 'new' | 'old',
  ): Promise<void> {
    const text = audience === 'new' ? `Новый контакт: ${target}` : `Отвязан контакт: ${target}`;

    try {
      if (channel === 'phone') {
        await this.sms.sendText({ target, text: ContactChangeNotifierAdapter.TEXT });
        return;
      }

      const result = await this.email.sendMessage({
        target,
        subject: ContactChangeNotifierAdapter.SUBJECT,
        message: `<p>${ContactChangeNotifierAdapter.TEXT}</p><p>${text}</p>`,
        plainText: `${ContactChangeNotifierAdapter.TEXT}\n\n${text}`,
        messageId: `contact-change-${audience}-${randomUUID()}`,
      });

      if (!result.accepted) {
        this.logger.warn(
          `contact-change notification (${audience}) not accepted: ${result.reason ?? 'n/a'} ` +
            `to=${maskEmail(target)}`,
        );
      }
    } catch (err) {
      // PII не светим: в лог идёт маска и сообщение ошибки.
      const masked = channel === 'email' ? maskEmail(target) : maskPhone(target);
      this.logger.warn(
        `contact-change notification (${audience}) failed to=${masked}: ${(err as Error).message}`,
      );
    }
  }
}
