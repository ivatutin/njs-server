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
    if (challenge.providerCheckId) {
      pipeline.set(
        this.providerCheckKey(challenge.providerCheckId),
        challenge.id,
        'EX',
        ttlSeconds,
      );
    }
    await pipeline.exec();
  }

  async findById(challengeId: string): Promise<OtpChallenge | null> {
    const raw = await this.redis.get(this.challengeKey(challengeId));
    if (!raw) return null;
    return OtpChallenge.restore(JSON.parse(raw) as ReturnType<OtpChallenge['toSnapshot']>);
  }

  /**
   * Обратный индекс `otp:call:<check_id>` → id челленджа. Если челлендж уже
   * вытеснен или истёк, ключ может остаться (TTL тот же) — поэтому по найденному
   * id обязательно перечитываем сам челлендж.
   */
  async findByProviderCheckId(providerCheckId: string): Promise<OtpChallenge | null> {
    const challengeId = await this.redis.get(this.providerCheckKey(providerCheckId));
    if (!challengeId) return null;
    return this.findById(challengeId);
  }

  findActiveId(target: string, purpose: OtpPurpose): Promise<string | null> {
    return this.redis.get(this.activeKey(target, purpose));
  }

  async deleteById(challengeId: string): Promise<void> {
    await this.redis.del(this.challengeKey(challengeId));
  }

  async claimVerification(challengeId: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(this.claimKey(challengeId), '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  private remainingTtl(challenge: OtpChallenge): number {
    const seconds = Math.ceil((challenge.expiresAt.getTime() - Date.now()) / 1000);
    return Math.max(1, seconds);
  }

  private challengeKey(challengeId: string): string {
    return `otp:challenge:${challengeId}`;
  }

  private providerCheckKey(providerCheckId: string): string {
    return `otp:call:${providerCheckId}`;
  }

  /** Право на выдачу токена: `SET NX`, живёт столько же, сколько сам токен. */
  private claimKey(challengeId: string): string {
    return `otp:claim:${challengeId}`;
  }

  private activeKey(target: string, purpose: OtpPurpose): string {
    const digest = createHash('sha256').update(`${target}|${purpose}`).digest('hex');
    return `otp:active:${digest}`;
  }
}
