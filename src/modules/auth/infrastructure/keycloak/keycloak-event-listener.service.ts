import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS, EventBus } from '@shared/application/event-bus.interface';
import { EmailVerifiedEvent } from '../../domain/events/email-verified.event';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../domain/ports/identity-admin.port';

/** Период опроса Admin Events API. */
const POLL_INTERVAL_MS = 10_000;
/** За сколько секунд назад смотрим события (Keycloak хранит их до eventsExpiration). */
const LOOKBACK_SECONDS = 300;
/** Лимит памяти для дедупликации уже обработанных событий. */
const MAX_PROCESSED_KEYS = 500;

/**
 * «Слушатель» событий Keycloak без Java-SPI (см. ADR-0012): каждые
 * `POLL_INTERVAL_MS` читает Admin Events API по типу `VERIFY_EMAIL` и публикует
 * доменное событие `auth.email-verified`, на которое реагирует user-модуль.
 *
 * Повторная обработка безопасна: события дедуплицируются по `time:keycloakId`,
 * а обработчик в user-модуле идемпотентен (`verifyEmail()` ничего не делает
 * для уже подтверждённого email).
 */
@Injectable()
export class KeycloakEventListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeycloakEventListenerService.name);
  private readonly processed = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    this.logger.log(`Watching Keycloak ${'VERIFY_EMAIL'} events every ${POLL_INTERVAL_MS / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Один проход опроса. Вызывается по таймеру; в тестах вызывается напрямую. */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const events = await this.identityAdmin.findEmailVerificationEvents({
        sinceSeconds: LOOKBACK_SECONDS,
      });

      for (const event of events) {
        const key = `${event.time}:${event.keycloakId}`;
        if (this.processed.has(key)) continue;
        this.processed.add(key);

        await this.eventBus.publish(
          new EmailVerifiedEvent({ keycloakId: event.keycloakId, email: event.email }),
        );
        this.logger.log(`Verified email detected: kc=${event.keycloakId.substring(0, 8)}...`);
      }

      // Поллинг может перечитать те же события после рестарта — обработчик
      // идемпотентен, поэтому старые ключи можно смело забывать.
      if (this.processed.size > MAX_PROCESSED_KEYS) this.processed.clear();
    } catch (err) {
      // Keycloak может быть недоступен — это не повод падать приложению
      this.logger.warn(`Polling Keycloak events failed: ${(err as Error).message}`);
    } finally {
      this.polling = false;
    }
  }
}
