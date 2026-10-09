import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';
import { OtpRateLimitDecision, OtpRateLimiter } from '../../domain/ports/otp-rate-limiter.port';
import {
  OTP_COOLDOWN_SECONDS,
  OTP_MAX_PER_IP_PER_HOUR,
  OTP_MAX_PER_TARGET_PER_HOUR,
} from '../../domain/otp-policy';

const HOUR_SECONDS = 3600;

/**
 * Лимиты отправки на счётчиках Redis (INCR + EXPIRE):
 * cooldown 60 c на target, 3/час на target, 10/час на IP.
 *
 * Cooldown «сгорает» даже если сработал более общий лимит — это осознанно:
 * так повторные попытки не долбят хранилище чаще, чем раз в минуту.
 */
@Injectable()
export class RedisOtpRateLimiter implements OtpRateLimiter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(params: { target: string; ip?: string | null }): Promise<OtpRateLimitDecision> {
    const targetHash = this.digest(params.target);

    const cooldownKey = `otp:rl:cooldown:${targetHash}`;
    const acquired = await this.redis.set(cooldownKey, '1', 'EX', OTP_COOLDOWN_SECONDS, 'NX');
    if (acquired === null) {
      return { allowed: false, retryAfterSeconds: await this.ttl(cooldownKey) };
    }

    const targetKey = `otp:rl:target:${targetHash}`;
    if ((await this.increment(targetKey)) > OTP_MAX_PER_TARGET_PER_HOUR) {
      return { allowed: false, retryAfterSeconds: await this.ttl(targetKey) };
    }

    if (params.ip) {
      const ipKey = `otp:rl:ip:${params.ip}`;
      if ((await this.increment(ipKey)) > OTP_MAX_PER_IP_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: await this.ttl(ipKey) };
      }
    }

    return { allowed: true };
  }

  /** Инкремент с установкой TTL при первой записи. */
  private async increment(key: string): Promise<number> {
    const value = await this.redis.incr(key);
    if (value === 1) await this.redis.expire(key, HOUR_SECONDS);
    return value;
  }

  private async ttl(key: string): Promise<number> {
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : 1;
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
