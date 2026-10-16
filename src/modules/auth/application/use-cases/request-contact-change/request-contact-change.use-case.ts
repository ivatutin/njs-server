import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { OTP_CHALLENGES, OtpChallenges } from '@shared/application/otp-challenges.interface';
import {
  USER_CONTACTS,
  UserContacts,
  UserContactsSnapshot,
} from '@shared/application/user-contacts.interface';
import { ContactAlreadyExistsError } from '@shared/domain/errors/contact-already-exists.error';
import { OtpRateLimitedError } from '@shared/domain/errors/otp-rate-limited.error';
import { UserNotFoundError } from '@shared/domain/errors/user-not-found.error';
import { ContactChangeAlreadyPendingError } from '../../../domain/errors/contact-change-already-pending.error';
import {
  CHANGE_TOKEN_STORE,
  ChangeTokenStore,
} from '../../../domain/ports/change-token-store.port';
import { RequestContactChangeCommand } from './request-contact-change.command';

/** Ответ `POST /users/me/contact-change/request` (контракт v1.3). */
export interface RequestContactChangeResult {
  changeToken: string;
  requiresOldChallenge: boolean;
  oldChallengeId: string | null;
  newChallengeId: string;
}

type ContactChannel = 'email' | 'phone';

/**
 * Шаг 1 смены контакта (ADR-0017): проверки → два челленджа → запись смены.
 *
 * Порядок проверок специально от дешёвых к дорогим: пользователь → нормализация и занятость
 * контакта (`409` до отправки кодов) → личный лимит (I8) → отправка кодов → запись `changeToken`.
 * Контакт в логи не пишем (PII), пишем только id челленджей.
 */
@Injectable()
export class RequestContactChangeUseCase implements UseCase<
  RequestContactChangeCommand,
  RequestContactChangeResult
> {
  private readonly logger = new Logger(RequestContactChangeUseCase.name);

  constructor(
    @Inject(USER_CONTACTS) private readonly contacts: UserContacts,
    @Inject(OTP_CHALLENGES) private readonly challenges: OtpChallenges,
    @Inject(CHANGE_TOKEN_STORE) private readonly changes: ChangeTokenStore,
  ) {}

  async execute(cmd: RequestContactChangeCommand): Promise<RequestContactChangeResult> {
    const user = await this.contacts.find(cmd.keycloakId);
    if (!user) throw new UserNotFoundError(`keycloakId=${cmd.keycloakId}`);

    const target = this.contacts.normalize(cmd.channel, cmd.newValue);
    const current = cmd.channel === 'email' ? user.email : user.phone;
    if (current === target) throw new ContactAlreadyExistsError();
    if (await this.contacts.isContactTaken({ [cmd.channel]: target })) {
      throw new ContactAlreadyExistsError();
    }

    // Одна активная смена: проверяем **до** отправки кодов. Иначе лимиты OTP срабатывают раньше
    // и пользователь вместо «смена уже идёт → cancel» получает OtpRateLimited (нашлось на приёмке).
    if (await this.changes.hasActive(cmd.keycloakId)) {
      throw new ContactChangeAlreadyPendingError();
    }

    // Личный лимит: у каждого нового контакта своей истории лимитов нет, поэтому перебор
    // «новых» адресов ловится только здесь (ADR-0017 §7, I8). Код ошибки — тот же, что у OTP-лимитов.
    const quota = await this.changes.consumeUserQuota(cmd.keycloakId);
    if (!quota.allowed) throw new OtpRateLimitedError(quota.retryAfterSeconds);

    const old = this.pickOldContact(user, cmd.channel);

    const newChallenge = await this.challenges.start({
      channel: cmd.channel,
      target,
      purpose: 'change-contact-new',
      ip: cmd.ip ?? null,
    });

    const oldChallenge = old
      ? await this.challenges.start({
          channel: old.channel,
          target: old.target,
          purpose: 'change-contact-old',
          ip: cmd.ip ?? null,
        })
      : null;

    const created = await this.changes.create({
      keycloakId: cmd.keycloakId,
      channel: cmd.channel,
      target,
      oldTarget: old?.target ?? null,
      requiresOldChallenge: old !== null,
      newChallengeId: newChallenge.challengeId,
      oldChallengeId: oldChallenge?.challengeId ?? null,
    });

    this.logger.log(
      `contact-change requested kc=${cmd.keycloakId.substring(0, 8)}... channel=${cmd.channel} ` +
        `new=${newChallenge.challengeId} old=${oldChallenge?.challengeId ?? 'none'}`,
    );

    return {
      changeToken: created.token,
      requiresOldChallenge: old !== null,
      oldChallengeId: oldChallenge?.challengeId ?? null,
      newChallengeId: newChallenge.challengeId,
    };
  }

  /**
   * Кому уходит второй код (ADR-0017 §6, I2): заменяемому контакту, если он подтверждён,
   * иначе — другому подтверждённому. Смена **email** без подтверждения старого контакта
   * запрещена решением координатора (иначе украденный пароль = постоянный захват аккаунта),
   * поэтому при наличии любого подтверждённого контакта второй челлендж обязателен.
   */
  private pickOldContact(
    user: UserContactsSnapshot,
    channel: ContactChannel,
  ): { channel: ContactChannel; target: string } | null {
    if (channel === 'phone' && user.phone && user.phoneVerifiedAt) {
      return { channel: 'phone', target: user.phone };
    }
    if (user.email && user.emailVerifiedAt) {
      return { channel: 'email', target: user.email };
    }
    if (user.phone && user.phoneVerifiedAt) {
      return { channel: 'phone', target: user.phone };
    }
    return null;
  }
}
