import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';
import {
  REAUTH_TOKEN_TTL_SECONDS,
  ReauthTokenStore,
} from '../../domain/ports/reauth-token-store.port';

/**
 * Reauth-токены в Redis: `auth:reauth:<sha256(token)>` → `keycloakId`.
 *
 * Хранится хеш, а не сам токен (как и у OTP-кодов): утечка дампа Redis не даёт
 * возможности предъявить чужой токен. Значение — `keycloakId`, поэтому токен
 * нельзя использовать от имени другого пользователя.
 */
@Injectable()
export class RedisReauthTokenStore implements ReauthTokenStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async issue(params: { keycloakId: string }): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + REAUTH_TOKEN_TTL_SECONDS * 1000);

    await this.redis.set(this.key(token), params.keycloakId, 'EX', REAUTH_TOKEN_TTL_SECONDS);

    return { token, expiresAt };
  }

  async consume(token: string): Promise<{ keycloakId: string } | null> {
    const keycloakId = await this.redis.getdel(this.key(token));
    return keycloakId ? { keycloakId } : null;
  }

  private key(token: string): string {
    return `auth:reauth:${createHash('sha256').update(token).digest('hex')}`;
  }
}
