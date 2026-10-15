import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { TokenStorePort } from '../../domain/ports/token-store.port';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';

/**
 * Redis-реализация `TokenStorePort` (ADR-0018).
 *
 * Ключи:
 * - `auth:blacklist:<token>` — конкретный отозванный токен (TTL = остаток жизни);
 * - `auth:sub-revoked:<sub>` — метка отзыва пользователя, значение = `floor(now / 1000)`.
 *
 * Guard проверяет оба ключа одним `MGET` (C2): блоклист и `iat < revokedAt`. Потеря Redis сбрасывает отзывы —
 * тот же компромисс, что в ADR-0011 (в compose включён AOF).
 */
@Injectable()
export class RedisTokenStore implements TokenStorePort {
  private readonly BLACKLIST_PREFIX = 'auth:blacklist:';
  private readonly SUB_REVOKED_PREFIX = 'auth:sub-revoked:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async blacklistToken(token: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      // Token is already expired — nothing to store.
      return;
    }
    await this.redis.set(this.blacklistKey(token), '1', 'EX', ttlSeconds);
  }

  async revokeUserTokens(sub: string, ttlSeconds: number): Promise<void> {
    const revokedAt = Math.floor(Date.now() / 1000);
    await this.redis.set(this.subRevokedKey(sub), String(revokedAt), 'EX', ttlSeconds);
  }

  async isAccessRevoked(params: {
    token: string;
    sub: string;
    issuedAt: number;
  }): Promise<boolean> {
    const [blacklisted, revokedAt] = await this.redis.mget(
      this.blacklistKey(params.token),
      this.subRevokedKey(params.sub),
    );

    if (blacklisted !== null) return true;
    if (revokedAt === null) return false;

    // Строгое сравнение (C2): токен, выданный в секунду отзыва, — это свежий вход, он остаётся живым.
    return params.issuedAt < Number(revokedAt);
  }

  private blacklistKey(token: string): string {
    return `${this.BLACKLIST_PREFIX}${token}`;
  }

  private subRevokedKey(sub: string): string {
    return `${this.SUB_REVOKED_PREFIX}${sub}`;
  }
}
