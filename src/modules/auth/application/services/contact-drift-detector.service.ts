import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  USER_CONTACTS,
  UserContacts,
  UserContactsSnapshot,
} from '@shared/application/user-contacts.interface';
import { maskEmail, maskPhone } from '@shared/domain/target-mask';
import {
  IDENTITY_ADMIN,
  IdentityAdminPort,
  IdentityAdminUser,
} from '../../domain/ports/identity-admin.port';

/** Сколько пользователей shadow забираем за одну страницу сверки. */
const PAGE_SIZE = 100;

/** Интервал по умолчанию: раз в 30 минут (переопределяется `CONTACT_DRIFT_DETECTOR_INTERVAL_SECONDS`). */
const DEFAULT_INTERVAL_SECONDS = 1800;

/** Итог одного прохода — для лога и для тестов. */
export interface DriftScanSummary {
  scanned: number;
  drifted: number;
  healed: number;
  failed: number;
}

/**
 * Drift-детектор контактов shadow ↔ Keycloak (ADR-0017 §3 — долг после Auth v1).
 *
 * Зачем: контакт живёт в двух системах, и частичный сбой (Keycloak не принял + не удалась компенсация)
 * оставляет их расходящимися. Детектор периодически сверяет состояние и **приводит Keycloak к shadow**:
 * shadow — источник правды для контактов (уникальность телефона держим мы), а в Keycloak контакт —
 * производное (`email` + наши атрибуты).
 *
 * Почему именно в эту сторону: смену контакта пишет наш flow, shadow — первым. Обратное означало бы,
 * что ручная правка в Account Console принимается как истина, хотя контракт этого не обещает.
 *
 * Идемпотентность: повторный проход по согласованным пользователям ничего не пишет. `heal` можно
 * выключить (`CONTACT_DRIFT_HEAL_ENABLED=false`) — тогда детектор только сообщает о расхождениях.
 * Если identity в Keycloak нет вовсе — это отдельный класс расхождения: сообщаем, но не «лечим»
 * (создавать и удалять пользователей детектор не вправе).
 *
 * Периодичность — по идиоме проекта (`setInterval` в `OnModuleInit`, как в `KeycloakEventListenerService`),
 * без внешнего планировщика и новых зависимостей. Первый проход идёт **через интервал**, а не на старте,
 * чтобы не тормозить boot.
 */
@Injectable()
export class ContactDriftDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactDriftDetectorService.name);
  private readonly enabled: boolean;
  private readonly heal: boolean;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(USER_CONTACTS) private readonly contacts: UserContacts,
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('CONTACT_DRIFT_DETECTOR_ENABLED') !== 'false';
    this.heal = config.get<string>('CONTACT_DRIFT_HEAL_ENABLED') !== 'false';

    const seconds = Number(config.get('CONTACT_DRIFT_DETECTOR_INTERVAL_SECONDS'));
    this.intervalMs =
      (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_INTERVAL_SECONDS) * 1000;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('contact drift detector disabled (CONTACT_DRIFT_DETECTOR_ENABLED=false)');
      return;
    }

    this.timer = setInterval(() => void this.scanOnce(), this.intervalMs);
    this.timer.unref?.();
    this.logger.log(
      `contact drift detector started: every ${this.intervalMs / 1000}s, heal=${this.heal}`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Один проход по всем пользователям shadow. Публичный: его же вызывают ручная проверка на стенде
   * и тесты (в проде — по таймеру).
   */
  async scanOnce(): Promise<DriftScanSummary> {
    const summary: DriftScanSummary = { scanned: 0, drifted: 0, healed: 0, failed: 0 };
    let afterId: string | null = null;

    for (;;) {
      const page = await this.contacts.listForReconciliation({ afterId, limit: PAGE_SIZE });
      if (page.length === 0) break;

      for (const user of page) {
        summary.scanned += 1;
        try {
          await this.checkUser(user, summary);
        } catch (err) {
          summary.failed += 1;
          this.logger.error(
            `contact_drift_check_failed kc=${this.short(user.keycloakId)}: ${(err as Error).message}`,
          );
        }
      }

      afterId = page[page.length - 1].id;
      if (page.length < PAGE_SIZE) break;
    }

    this.logger.log(
      `contact drift scan done: scanned=${summary.scanned} drifted=${summary.drifted} ` +
        `healed=${summary.healed} failed=${summary.failed}`,
    );
    return summary;
  }

  private async checkUser(user: UserContactsSnapshot, summary: DriftScanSummary): Promise<void> {
    const identity = await this.identityAdmin.findById(user.keycloakId);
    if (!identity) {
      summary.drifted += 1;
      this.logger.error(
        `contact_drift_identity_missing shadow_user=${user.id} kc=${this.short(user.keycloakId)} — ` +
          'разбирается вручную (создание/удаление пользователей вне полномочий детектора)',
      );
      return;
    }

    const fields = this.differences(user, identity);
    if (fields.length === 0) return;

    summary.drifted += 1;
    const where = `kc=${this.short(user.keycloakId)} fields=${fields.join(',')} ${this.describe(user)}`;

    if (!this.heal) {
      this.logger.warn(`contact_drift_detected (report-only, heal disabled) ${where}`);
      return;
    }

    try {
      // Починка = идемпотентный повтор: пишем в Keycloak полное состояние контактов из shadow.
      await this.identityAdmin.updateContacts({
        keycloakId: user.keycloakId,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
        phone: user.phone,
        phoneVerified: user.phoneVerifiedAt !== null,
      });
      summary.healed += 1;
      this.logger.warn(`contact_drift_healed ${where}`);
    } catch (err) {
      summary.failed += 1;
      this.logger.error(`contact_drift_heal_failed ${where}: ${(err as Error).message}`);
    }
  }

  /**
   * Какие поля контактов расходятся. Email сравниваем в нижнем регистре (нормализация shadow),
   * телефон — как есть: если Keycloak хранит не наш канонический E.164, это тоже полезно «починить».
   */
  private differences(user: UserContactsSnapshot, identity: IdentityAdminUser): string[] {
    const fields: string[] = [];
    const kcEmail = (identity.email ?? null)?.toLowerCase() ?? null;
    const shadowEmail = user.email?.toLowerCase() ?? null;

    if (kcEmail !== shadowEmail) fields.push('email');
    if (identity.emailVerified !== (user.emailVerifiedAt !== null)) fields.push('emailVerified');
    if ((identity.phone ?? null) !== user.phone) fields.push('phone');
    if (identity.phoneVerified !== (user.phoneVerifiedAt !== null)) fields.push('phoneVerified');

    return fields;
  }

  /** В лог уходят только маски: полные контакты — PII. */
  private describe(user: UserContactsSnapshot): string {
    const email = user.email ? `email=${maskEmail(user.email)}` : 'email=none';
    const phone = user.phone ? `phone=${maskPhone(user.phone)}` : 'phone=none';
    return `${email} ${phone}`;
  }

  private short(keycloakId: string): string {
    return keycloakId.substring(0, 8);
  }
}
