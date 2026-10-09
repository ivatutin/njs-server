import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';
import {
  VerificationTokenIssuer,
  VerificationTokenPayload,
} from '../../domain/ports/verification-token.port';
import { VERIFICATION_TOKEN_TTL_SECONDS } from '../../domain/otp-policy';

/**
 * One-shot токены в Redis (TTL 10 мин): `otp:verification:<token>` → `{target, purpose}`.
 * Чтение через `GETDEL` — предъявленный токен сразу исчезает (одноразовость).
 */
@Injectable()
export class RedisVerificationTokenIssuer implements VerificationTokenIssuer {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async issue(payload: VerificationTokenPayload): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(
      this.key(token),
      JSON.stringify(payload),
      'EX',
      VERIFICATION_TOKEN_TTL_SECONDS,
    );
    return token;
  }

  async consume(token: string): Promise<VerificationTokenPayload | null> {
    const raw = await this.redis.getdel(this.key(token));
    if (!raw) return null;
    return JSON.parse(raw) as VerificationTokenPayload;
  }

  private key(token: string): string {
    return `otp:verification:${token}`;
  }
}
