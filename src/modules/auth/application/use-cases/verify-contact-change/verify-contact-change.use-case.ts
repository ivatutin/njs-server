import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import {
  OTP_CHALLENGES,
  OtpChallenges,
} from '@shared/application/otp-challenges.interface';
import {
  USER_CONTACTS,
  UserContacts,
  UserContactsSnapshot,
} from '@shared/application/user-contacts.interface';
import { UserNotFoundError } from '@shared/domain/errors/user-not-found.error';
import { maskEmail, maskPhone } from '@shared/domain/target-mask';
import { ChangeTokenExpiredError } from '../../../domain/errors/change-token-expired.error';
import { ContactChangeUnavailableError } from '../../../domain/errors/contact-change-unavailable.error';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import {
  CHANGE_TOKEN_STORE,
  ChangeTokenStore,
  ContactChangeRecord,
} from '../../../domain/ports/change-token-store.port';
import { RevokeUserAccessUseCase } from '../revoke-user-access/revoke-user-access.use-case';
import { RevokeUserAccessCommand } from '../revoke-user-access/revoke-user-access.command';
import { VerifyContactChangeCommand } from './verify-contact-change.command';

/** Сколько раз пробуем записать контакт в Keycloak до компенсации (ADR-0017 §3). */
const KEYCLOAK_MAX_ATTEMPTS = 3;

export interface VerifyContactChangeResult {
  user: UserContactsSnapshot;
}

/**
 * Шаг 2 смены контакта (ADR-0017 ред. 2) — порядок операций зафиксирован координатором:
 *
 * 1. проверка кодов (`OTP_CHALLENGES.verify` по паре target+purpose);
 * 2. **отзыв доступа** (`RevokeUserAccessUseCase`, ADR-0018) — **до** применения, иначе состояние
 *    «применено, но не отозвано» достижимо, а `503` становится неправдой для клиента;
 * 3. shadow-БД: транзакционная смена контакта (внутри — ре-чек занятости);
 * 4. Keycloak: `email`/`phoneNumber` + verified, ретраи 3×;
 * 5. успех → `applied` (повтор `verify` отвечает `200` идемпотентно до TTL токена).
 *
 * Сбой Keycloak после записи в shadow → компенсация (откат shadow) и `503` **с сохранением**
 * `changeToken`: ничего не применено, повтор разрешён (семантика B2-1). Если не удалась и
 * компенсация — смена помечается `failed`, пишется алерт-лог `contact_change_failed`, и повторный
 * `verify` уже ничего не применяет (drift разбирается руками, детектор — долг после Auth v1).
 */
@Injectable()
export class VerifyContactChangeUseCase implements UseCase<
  VerifyContactChangeCommand,
  VerifyContactChangeResult
> {
  private readonly logger = new Logger(VerifyContactChangeUseCase.name);

  constructor(
    @Inject(CHANGE_TOKEN_STORE) private readonly changes: ChangeTokenStore,
    @Inject(OTP_CHALLENGES) private readonly challenges: OtpChallenges,
    @Inject(USER_CONTACTS) private readonly contacts: UserContacts,
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    private readonly revokeAccess: RevokeUserAccessUseCase,
  ) {}

  async execute(cmd: VerifyContactChangeCommand): Promise<VerifyContactChangeResult> {
    const record = await this.changes.find(cmd.changeToken);
    if (!record) throw new ChangeTokenExpiredError();

    const kcShort = record.keycloakId.substring(0, 8);

    // Идемпотентность (решение координатора 2a): повтор после успеха — тот же `200 UserDto`.
    if (record.status === 'applied') {
      const current = await this.contacts.find(record.keycloakId);
      if (!current) throw new UserNotFoundError(`keycloakId=${record.keycloakId}`);
      this.logger.log(`contact-change verify repeat (already applied) kc=${kcShort}...`);
      return { user: current };
    }

    // Инцидент: компенсация не удалась, повторять применение нельзя.
    if (record.status === 'failed') {
      this.logger.error(
        `contact_change_failed (terminal) kc=${kcShort}... reason=${record.failureReason ?? 'n/a'}`,
      );
      throw new ServiceUnavailableException('Contact change is in a failed state');
    }

    // 1. Коды: новый контакт — обязателен, старый — когда его требует смена.
    await this.challenges.verify({
      target: record.target,
      purpose: 'change-contact-new',
      code: cmd.newCode,
    });
    if (record.requiresOldChallenge) {
      // Пустой `oldCode` доходит до порта и штатно отвечает `OtpInvalid` (хеш не сойдётся).
      await this.challenges.verify({
        target: record.oldTarget ?? '',
        purpose: 'change-contact-old',
        code: cmd.oldCode ?? '',
      });
    }

    const before = await this.contacts.find(record.keycloakId);
    if (!before) throw new UserNotFoundError(`keycloakId=${record.keycloakId}`);

    // 2. Отзыв доступа — ДО применения (координатор). Падение → 503, контакт не тронут.
    await this.revokeAccess.execute(
      new RevokeUserAccessCommand(record.keycloakId, 'contact-change'),
    );

    // 3. Shadow: транзакционная смена контакта (внутри — ре-чек занятости).
    const applied = await this.contacts.applyVerifiedChange({
      keycloakId: record.keycloakId,
      ...(record.channel === 'email' ? { email: record.target } : { phone: record.target }),
    });

    // 4. Keycloak с ретраями.
    const written = await this.writeToKeycloak(record);
    if (!written) {
      const compensated = await this.rollbackTo(before);

      if (compensated) {
        // B2-1: ничего не применено, changeToken жив, повтор разрешён.
        this.logger.error(
          `contact_change_failed (compensated, retry allowed) kc=${kcShort}... ` +
            `channel=${record.channel} want=${this.mask(record.channel, record.target)} ` +
            `actual=${this.mask(record.channel, this.currentTarget(before, record.channel))}`,
        );
        throw new ContactChangeUnavailableError();
      }

      // Компенсация не удалась — инцидент/drift: фиксируем и зовём разбор руками.
      await this.markFailedSafe(cmd.changeToken, 'keycloak write failed and rollback failed');
      this.logger.error(
        `contact_change_failed (drift, manual fix required) kc=${kcShort}... ` +
          `channel=${record.channel} want=${this.mask(record.channel, record.target)} ` +
          `actual=${this.mask(record.channel, this.currentTarget(before, record.channel))}`,
      );
      throw new ServiceUnavailableException('Contact change failed and could not be rolled back');
    }

    // 5. Успех: смена применена; повтор `verify` идемпотентен до TTL токена.
    await this.changes.markApplied(cmd.changeToken);
    this.logger.log(`contact-change applied kc=${kcShort}... channel=${record.channel}`);

    return { user: applied };
  }

  /** Запись контакта в Keycloak с ретраями; `false` — попытки исчерпаны. */
  private async writeToKeycloak(record: ContactChangeRecord): Promise<boolean> {
    const params =
      record.channel === 'email'
        ? { keycloakId: record.keycloakId, email: record.target, emailVerified: true }
        : { keycloakId: record.keycloakId, phone: record.target, phoneVerified: true };

    for (let attempt = 1; attempt <= KEYCLOAK_MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.identityAdmin.updateContacts(params);
        return true;
      } catch (err) {
        this.logger.warn(
          `contact-change: keycloak update attempt ${attempt}/${KEYCLOAK_MAX_ATTEMPTS} failed: ${(err as Error).message}`,
        );
      }
    }

    return false;
  }

  /** Компенсация: возвращаем контакты к состоянию «до». `false` — откат не удался. */
  private async rollbackTo(before: UserContactsSnapshot): Promise<boolean> {
    try {
      await this.contacts.rollback({
        keycloakId: before.keycloakId,
        email: before.email,
        phone: before.phone,
        emailVerifiedAt: before.emailVerifiedAt,
        phoneVerifiedAt: before.phoneVerifiedAt,
      });
      return true;
    } catch (err) {
      this.logger.error(`contact-change rollback failed: ${(err as Error).message}`);
      return false;
    }
  }

  /** Пометка `failed` не должна подменять исходную ошибку — глушим её с логом. */
  private async markFailedSafe(token: string, reason: string): Promise<void> {
    try {
      await this.changes.markFailed(token, reason);
    } catch (err) {
      this.logger.error(
        `contact-change: could not mark change as failed: ${(err as Error).message}`,
      );
    }
  }

  private currentTarget(user: UserContactsSnapshot, channel: 'email' | 'phone'): string {
    return (channel === 'email' ? user.email : user.phone) ?? '';
  }

  /** В логи уходит только маска: полные контакты — PII (ADR-0017 §7). */
  private mask(channel: 'email' | 'phone', value: string): string {
    if (!value) return 'none';
    return channel === 'email' ? maskEmail(value) : maskPhone(value);
  }
}
