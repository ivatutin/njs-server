import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { TokenStorePort } from '../../domain/ports/token-store.port';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';

/**
 * Redis-backed implementation of TokenStorePort.
 * Stores blacklisted tokens with TTL equal to their remaining lifetime,
 * so Redis evicts them automatically — no cleanup job required.
 */
@Injectable()
export class RedisTokenStore implements TokenStorePort {
  private readonly KEY_PREFIX = 'auth:blacklist:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async blacklistToken(token: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      // Token is already expired — nothing to store.
      return;
    }
    await this.redis.set(this.key(token), '1', 'EX', ttlSeconds);
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const exists = await this.redis.exists(this.key(token));
    return exists === 1;
  }

  private key(token: string): string {
    return `${this.KEY_PREFIX}${token}`;
  }
}
