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

/** Что детектор собирается сделать с одним пользователем (см. `plan()`). */
interface DriftPlan {
  /** Разошедшиеся поля — для лога; в report-only режиме этого достаточно. */
  fields: string[];
  /** Запись в Keycloak: значения контактов и/или отставшие флаги. `null` — писать нечего. */
  toKeycloak: Parameters<IdentityAdminPort['updateContacts']>[0] | null;
  /** Каналы, где флаг подтверждён в Keycloak, а в shadow нет: дочиняем **shadow**. */
  forward: ('email' | 'phone')[];
}

/**
 * Drift-детектор контактов shadow ↔ Keycloak (ADR-0017 §3 — долг после Auth v1).
 *
 * Зачем: контакт живёт в двух системах, и частичный сбой (Keycloak не принял + не удалась компенсация)
 * оставляет их расходящимися. Детектор периодически сверяет состояние и **приводит Keycloak к shadow**:
 * shadow — источник правды для контактов (уникальность телефона держим мы), а в Keycloak контакт —
 * производное (`email` + наши атрибуты).
 *
 * Почему значения именно в эту сторону: смену контакта пишет наш flow, shadow — первым. Обратное означало бы,
 * что ручная правка в Account Console принимается как истина, хотя контракт этого не обещает (следствие
 * для эксплуатации: ручная правка контакта в Account Console будет откатана — `DEPLOYMENT.md` §7 п.13).
 *
 * **Правило по типу поля (ред. 4 — по ревью координатора):**
 * - **значения контактов** (`email`, `phone`) — всегда shadow → Keycloak;
 * - **флаги подтверждения** (`emailVerified`, `phoneVerified`) — **монотонны, «true побеждает»**:
 *   `emailVerified = true` ставит **сам Keycloak** (клик по ссылке из письма), а shadow узнаёт об этом
 *   асинхронно — через поллинг Admin Events. Если значения совпали, а флаг есть только в Keycloak,
 *   дочиняем **shadow** (`contact_drift_flag_forwarded`): иначе детектор откатывал бы честную
 *   верификацию, и пользователь остался бы `pending_verification` навсегда. Если значения **разошлись** —
 *   пишем в Keycloak значение и флаг из shadow: смена контакта легитимно сбрасывает подтверждение.
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

    const plan = this.plan(user, identity);
    if (plan.fields.length === 0) return;

    summary.drifted += 1;
    const where = `kc=${this.short(user.keycloakId)} fields=${plan.fields.join(',')} ${this.describe(user)}`;

    if (!this.heal) {
      this.logger.warn(`contact_drift_detected (report-only, heal disabled) ${where}`);
      return;
    }

    let healed = false;

    if (plan.toKeycloak) {
      try {
        // Идемпотентно: пишем только те каналы, которые реально разошлись (read-modify-write на стороне адаптера).
        await this.identityAdmin.updateContacts(plan.toKeycloak);
        healed = true;
      } catch (err) {
        summary.failed += 1;
        this.logger.error(`contact_drift_heal_failed ${where}: ${(err as Error).message}`);
      }
    }

    for (const channel of plan.forward) {
      try {
        // Флаг подтвердил **сам Keycloak** (клик по ссылке), а shadow об этом не узнал — событие потерялось.
        // Флаг монотонен: дочиняем shadow, Keycloak не трогаем.
        const updated = await this.contacts.markVerified({ keycloakId: user.keycloakId, channel });
        if (updated) {
          healed = true;
          this.logger.warn(
            `contact_drift_flag_forwarded kc=${this.short(user.keycloakId)} channel=${channel} — ` +
              'флаг подтверждения дочинен в shadow',
          );
        }
      } catch (err) {
        summary.failed += 1;
        this.logger.error(
          `contact_drift_flag_forward_failed kc=${this.short(user.keycloakId)} channel=${channel}: ` +
            `${(err as Error).message}`,
        );
      }
    }

    if (healed) {
      summary.healed += 1;
      this.logger.warn(`contact_drift_healed ${where}`);
    }
  }

  /**
   * Правило сверки (ADR-0017 §3, ред. 4):
   *
   * - **значения контактов** (`email`, `phone`) — источник правды shadow: расхождение лечится записью
   *   значения из shadow в Keycloak. Email сравниваем в нижнем регистре (нормализация shadow),
   *   телефон — как есть: если Keycloak хранит не наш канонический E.164, это тоже полезно «починить»;
   * - **флаги подтверждения** (`emailVerified`, `phoneVerified`) — монотонны, «true побеждает»: отставать
   *   может **любая** сторона, потому что флаг в Keycloak ставит сам Keycloak, а shadow узнаёт об этом
   *   асинхронно. При совпавших значениях флаг «с истиной» дочиняется в Keycloak, а флаг, стоящий
   *   только в Keycloak, дочиняется в **shadow** (иначе детектор откатил бы честную верификацию);
   * - если значения **разошлись**, флаг в Keycloak относится к прежнему значению: пишем значение и флаг
   *   из shadow — смена контакта легитимно сбрасывает подтверждение.
   */
  private plan(user: UserContactsSnapshot, identity: IdentityAdminUser): DriftPlan {
    const kcEmail = identity.email?.toLowerCase() ?? null;
    const shadowEmail = user.email?.toLowerCase() ?? null;
    const shadowEmailVerified = user.emailVerifiedAt !== null;
    const shadowPhoneVerified = user.phoneVerifiedAt !== null;

    const emailValueDrift = kcEmail !== shadowEmail;
    const phoneValueDrift = (identity.phone ?? null) !== user.phone;

    const fields: string[] = [];
    const forward: ('email' | 'phone')[] = [];
    const write: NonNullable<DriftPlan['toKeycloak']> = { keycloakId: user.keycloakId };

    if (emailValueDrift) {
      fields.push('email');
      write.email = user.email;
      write.emailVerified = shadowEmailVerified;
    } else if (shadowEmailVerified && !identity.emailVerified) {
      fields.push('emailVerified');
      write.emailVerified = true;
    } else if (identity.emailVerified && !shadowEmailVerified) {
      fields.push('emailVerified');
      forward.push('email');
    }

    if (phoneValueDrift) {
      fields.push('phone');
      write.phone = user.phone;
      write.phoneVerified = shadowPhoneVerified;
    } else if (shadowPhoneVerified && !identity.phoneVerified) {
      fields.push('phoneVerified');
      write.phoneVerified = true;
    } else if (identity.phoneVerified && !shadowPhoneVerified) {
      fields.push('phoneVerified');
      forward.push('phone');
    }

    const hasKeycloakWrite =
      write.email !== undefined ||
      write.emailVerified !== undefined ||
      write.phone !== undefined ||
      write.phoneVerified !== undefined;

    return { fields, toKeycloak: hasKeycloakWrite ? write : null, forward };
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
