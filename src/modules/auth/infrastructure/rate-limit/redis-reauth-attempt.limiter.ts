import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';
import {
  ReauthAttemptDecision,
  ReauthAttemptLimiter,
} from '../../domain/ports/reauth-attempt-limiter.port';

/** Политика: 5 неудач за 15 минут на пользователя (решение координатора 15.10.2026). */
const WINDOW_SECONDS = 900;
const MAX_FAILURES = 5;

/**
 * Счётчик **неудачных** подтверждений пароля в Redis: `auth:reauth-fail:<sub>` (INCR + EXPIRE).
 *
 * Ключ — `keycloakId`: это не PII (в отличие от email/телефона), поэтому хешировать нечего.
 * Окно фиксированное: TTL ставится на первой неудаче и последующими не продлевается —
 * то есть через 15 минут от первой неудачи попытки снова доступны.
 */
@Injectable()
export class RedisReauthAttemptLimiter implements ReauthAttemptLimiter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(keycloakId: string): Promise<ReauthAttemptDecision> {
    const key = this.key(keycloakId);
    const failures = Number((await this.redis.get(key)) ?? 0);
    if (failures < MAX_FAILURES) return { allowed: true };

    const ttl = await this.redis.ttl(key);
    return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS };
  }

  async registerFailure(keycloakId: string): Promise<void> {
    const failures = await this.redis.incr(this.key(keycloakId));
    if (failures === 1) await this.redis.expire(this.key(keycloakId), WINDOW_SECONDS);
  }

  async reset(keycloakId: string): Promise<void> {
    await this.redis.del(this.key(keycloakId));
  }

  private key(keycloakId: string): string {
    return `auth:reauth-fail:${keycloakId}`;
  }
}
