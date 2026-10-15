import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';
import { ContactChangeAlreadyPendingError } from '../../domain/errors/contact-change-already-pending.error';
import {
  CHANGE_MAX_PER_USER_PER_DAY,
  CHANGE_TOKEN_STORE,
  CHANGE_TOKEN_TTL_SECONDS,
  CHANGE_USER_WINDOW_SECONDS,
  ChangeTokenStore,
  ContactChangeQuotaDecision,
  ContactChangeRecord,
  CreateContactChangeParams,
} from '../../domain/ports/change-token-store.port';

/**
 * `changeToken` в Redis (ADR-0017 §5).
 *
 * Ключи:
 * - `auth:change:<sha256(token)>` → JSON записи смены (TTL 10 минут);
 * - `auth:change-active:<sub>` → `<sha256(token)>` — слот «одна активная смена на пользователя»
 *   (занимается через `SET NX`, освобождается на `applied`/`failed`/`cancel`);
 * - `auth:change-quota:<sub>` → счётчик смен за сутки (I8).
 *
 * Токен наружу не логируется, в записи лежит контакт — поэтому TTL короткий, а логи пишут
 * только `challengeId`/`messageId` и факт события.
 */
@Injectable()
export class RedisChangeTokenStore implements ChangeTokenStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async create(params: CreateContactChangeParams): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const slotKey = this.activeSlotKey(params.keycloakId);

    // Атомарно занимаем слот: параллельный `request` не должен создать вторую смену.
    const slot = await this.redis.set(
      slotKey,
      this.digest(token),
      'EX',
      CHANGE_TOKEN_TTL_SECONDS,
      'NX',
    );
    if (slot === null) throw new ContactChangeAlreadyPendingError();

    const record: ContactChangeRecord = {
      keycloakId: params.keycloakId,
      channel: params.channel,
      target: params.target,
      oldTarget: params.oldTarget ?? null,
      requiresOldChallenge: params.requiresOldChallenge,
      newChallengeId: params.newChallengeId,
      oldChallengeId: params.oldChallengeId ?? null,
      status: 'pending',
    };

    await this.redis.set(
      this.recordKey(token),
      JSON.stringify(record),
      'EX',
      CHANGE_TOKEN_TTL_SECONDS,
    );

    return {
      token,
      expiresAt: new Date(Date.now() + CHANGE_TOKEN_TTL_SECONDS * 1000),
    };
  }

  async find(token: string): Promise<ContactChangeRecord | null> {
    const raw = await this.redis.get(this.recordKey(token));
    return raw ? (JSON.parse(raw) as ContactChangeRecord) : null;
  }

  async hasActive(keycloakId: string): Promise<boolean> {
    return (await this.redis.exists(this.activeSlotKey(keycloakId))) === 1;
  }

  async markApplied(token: string): Promise<void> {
    await this.updateStatus(token, { status: 'applied' });
  }

  async markFailed(token: string, reason: string): Promise<void> {
    await this.updateStatus(token, { status: 'failed', failureReason: reason });
  }

  async remove(token: string): Promise<void> {
    const record = await this.find(token);
    await this.redis.del(this.recordKey(token));
    if (record) await this.releaseSlot(token, record.keycloakId);
  }

  async consumeUserQuota(keycloakId: string): Promise<ContactChangeQuotaDecision> {
    const key = this.quotaKey(keycloakId);
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, CHANGE_USER_WINDOW_SECONDS);

    if (used > CHANGE_MAX_PER_USER_PER_DAY) {
      const ttl = await this.redis.ttl(key);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : CHANGE_USER_WINDOW_SECONDS };
    }

    return { allowed: true };
  }

  /** Переводит запись в терминальный статус, сохраняя остаток TTL, и освобождает слот. */
  private async updateStatus(
    token: string,
    patch: Partial<Pick<ContactChangeRecord, 'status' | 'failureReason'>>,
  ): Promise<void> {
    const record = await this.find(token);
    if (!record) return;

    const updated: ContactChangeRecord = { ...record, ...patch };
    await this.redis.set(this.recordKey(token), JSON.stringify(updated), 'KEEPTTL');
    await this.releaseSlot(token, record.keycloakId);
  }

  /** Освобождаем слот только если он всё ещё принадлежит этой смене. */
  private async releaseSlot(token: string, keycloakId: string): Promise<void> {
    const slotKey = this.activeSlotKey(keycloakId);
    if ((await this.redis.get(slotKey)) === this.digest(token)) {
      await this.redis.del(slotKey);
    }
  }

  private recordKey(token: string): string {
    return `auth:change:${this.digest(token)}`;
  }

  private activeSlotKey(keycloakId: string): string {
    return `auth:change-active:${keycloakId}`;
  }

  private quotaKey(keycloakId: string): string {
    return `auth:change-quota:${keycloakId}`;
  }

  private digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

export { CHANGE_TOKEN_STORE };
