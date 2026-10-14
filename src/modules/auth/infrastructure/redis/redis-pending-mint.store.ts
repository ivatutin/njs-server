import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/infrastructure/redis/redis.constants';
import { PendingMint, PendingMintStore } from '../../domain/ports/pending-mint-store.port';

/** Окно CIBA (`cibaExpiresIn`, 120 с) плюс запас на сетевые задержки. */
const PENDING_MINT_TTL_SECONDS = 180;

/**
 * Заявки на выдачу токенов в Redis: `ciba:mint:<binding_message>` → JSON.
 * Ключ — наш собственный UUID (не PII), чтение одноразовое (`GETDEL`), поэтому
 * повторное уведомление канала по той же заявке уже не найдёт её.
 */
@Injectable()
export class RedisPendingMintStore implements PendingMintStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async save(bindingMessage: string, mint: PendingMint): Promise<void> {
    await this.redis.set(
      this.key(bindingMessage),
      JSON.stringify(mint),
      'EX',
      PENDING_MINT_TTL_SECONDS,
    );
  }

  async consume(bindingMessage: string): Promise<PendingMint | null> {
    const raw = await this.redis.getdel(this.key(bindingMessage));
    if (!raw) return null;
    return JSON.parse(raw) as PendingMint;
  }

  private key(bindingMessage: string): string {
    return `ciba:mint:${bindingMessage}`;
  }
}
