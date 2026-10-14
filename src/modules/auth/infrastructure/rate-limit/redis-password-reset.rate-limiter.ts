import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';
import {
  PasswordResetLimitDecision,
  PasswordResetRateLimiter,
} from '../../domain/ports/password-reset-rate-limiter.port';

/** Окно лимита и максимум запросов в нём (3/час на адрес — чек-лист Phase 1.5). */
const WINDOW_SECONDS = 3600;
const MAX_PER_WINDOW = 3;

/**
 * Счётчик попыток сброса пароля в Redis (INCR + EXPIRE).
 * Email в ключе хешируется: PII не попадает в ключи Redis и их дампы.
 */
@Injectable()
export class RedisPasswordResetRateLimiter implements PasswordResetRateLimiter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(email: string): Promise<PasswordResetLimitDecision> {
    const key = `auth:pwdreset:${this.digest(email)}`;

    const attempts = await this.redis.incr(key);
    if (attempts === 1) await this.redis.expire(key, WINDOW_SECONDS);

    if (attempts > MAX_PER_WINDOW) {
      const ttl = await this.redis.ttl(key);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS };
    }

    return { allowed: true };
  }

  private digest(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }
}
