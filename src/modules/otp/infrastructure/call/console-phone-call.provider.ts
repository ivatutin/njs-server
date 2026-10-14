import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { CallStatus } from '../../domain/otp-policy';
import { maskPhone } from '../../domain/target-mask';
import { PhoneCallProvider, PhoneCallStart } from '../../domain/ports/phone-call-provider.port';

/**
 * DEV-заглушка звонкового провайдера (ADR-0014): боевой SMS.ru callcheck не
 * вызывается, заявка «подтверждается» сама через `SMSRU_DEV_CONFIRM_AFTER_SECONDS`
 * — этого достаточно, чтобы прогнать polling-сценарий звонкового канала локально
 * и во фронтовых e2e.
 *
 * Заглушка никогда не подтверждает номер в проде: в `NODE_ENV=production` `start()`
 * не создаёт заявку (→ 503), то есть при выключенном боевом канале поведение
 * fail-closed. Хранение времени старта — in-memory: dev-состояние не переживает
 * рестарт, и это осознанно.
 */
@Injectable()
export class ConsolePhoneCallProvider implements PhoneCallProvider {
  private readonly logger = new Logger(ConsolePhoneCallProvider.name);
  private readonly startedAt = new Map<string, number>();
  private readonly nodeEnv: string;
  private readonly confirmAfterSeconds: number;

  constructor(config: ConfigService) {
    this.nodeEnv = config.get<string>('app.nodeEnv') ?? 'development';
    this.confirmAfterSeconds = config.get<number>('smsru.devConfirmAfterSeconds') ?? 15;
  }

  async start(params: { phone: string; userIp?: string | null }): Promise<PhoneCallStart | null> {
    if (this.nodeEnv === 'production') {
      this.logger.error(
        'dev call provider is disabled in production — set SMSRU_CALLCHECK_ENABLED=true',
      );
      return null;
    }

    const providerCheckId = `dev-${randomUUID()}`;
    const callTo = '+7 (800) 000-00-00';
    this.startedAt.set(providerCheckId, Date.now());
    this.logger.log(
      `[dev-call] purpose-phone=${maskPhone(params.phone)} callTo=${callTo} ` +
        `check_id=${providerCheckId} (подтвердится через ${this.confirmAfterSeconds}с)`,
    );

    return { providerCheckId, callTo };
  }

  async status(providerCheckId: string): Promise<CallStatus> {
    const startedAt = this.startedAt.get(providerCheckId);
    if (startedAt === undefined) return 'failed';

    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    return elapsedSeconds >= this.confirmAfterSeconds ? 'verified' : 'pending';
  }
}
