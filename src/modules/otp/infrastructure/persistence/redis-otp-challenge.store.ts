import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpChallengeStore } from '../../domain/ports/otp-challenge-store.port';
import { OtpPurpose } from '../../domain/otp-policy';

/**
 * Челленджи в Redis.
 *
 * Ключи:
 * - `otp:challenge:<id>` → snapshot челленджа (JSON), TTL = остаток от `expiresAt`
 * - `otp:active:<sha256(target|purpose)>` → id активного челленджа (для resend)
 *
 * Target в ключах хешируется: PII не попадает ни в ключи Redis, ни в дампы/логи.
 */
@Injectable()
export class RedisOtpChallengeStore implements OtpChallengeStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async save(challenge: OtpChallenge): Promise<void> {
    const ttlSeconds = this.remainingTtl(challenge);
    const challengeKey = this.challengeKey(challenge.id);
    const activeKey = this.activeKey(challenge.target, challenge.purpose);

    const previousId = await this.redis.get(activeKey);
    const pipeline = this.redis.multi();
    if (previousId && previousId !== challenge.id) {
      pipeline.del(this.challengeKey(previousId));
    }
    pipeline.set(challengeKey, JSON.stringify(challenge.toSnapshot()), 'EX', ttlSeconds);
    pipeline.set(activeKey, challenge.id, 'EX', ttlSeconds);
    await pipeline.exec();
  }

  async findById(challengeId: string): Promise<OtpChallenge | null> {
    const raw = await this.redis.get(this.challengeKey(challengeId));
    if (!raw) return null;
    return OtpChallenge.restore(JSON.parse(raw) as ReturnType<OtpChallenge['toSnapshot']>);
  }

  findActiveId(target: string, purpose: OtpPurpose): Promise<string | null> {
    return this.redis.get(this.activeKey(target, purpose));
  }

  async deleteById(challengeId: string): Promise<void> {
    await this.redis.del(this.challengeKey(challengeId));
  }

  private remainingTtl(challenge: OtpChallenge): number {
    const seconds = Math.ceil((challenge.expiresAt.getTime() - Date.now()) / 1000);
    return Math.max(1, seconds);
  }

  private challengeKey(challengeId: string): string {
    return `otp:challenge:${challengeId}`;
  }

  private activeKey(target: string, purpose: OtpPurpose): string {
    const digest = createHash('sha256').update(`${target}|${purpose}`).digest('hex');
    return `otp:active:${digest}`;
  }
}
