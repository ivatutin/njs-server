import { Redis } from 'ioredis';
import { ContactChangeAlreadyPendingError } from '../../src/modules/auth/domain/errors/contact-change-already-pending.error';
import {
  CHANGE_TOKEN_TTL_SECONDS,
  CreateContactChangeParams,
} from '../../src/modules/auth/domain/ports/change-token-store.port';
import { RedisChangeTokenStore } from '../../src/modules/auth/infrastructure/redis/redis-change-token.store';

/**
 * Минимальный фейк Redis: только методы, которые использует стор
 * (`set` с `EX`/`NX`/`KEEPTTL`, `get`, `del`, `exists`, `incr`, `expire`, `ttl`).
 */
class FakeRedis {
  private readonly values = new Map<string, string>();
  private readonly expirations = new Map<string, number>();

  async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
    if (args.includes('NX') && this.values.has(key)) return null;

    this.values.set(key, value);

    const exIndex = args.indexOf('EX');
    if (exIndex >= 0) {
      this.expirations.set(key, Date.now() + Number(args[exIndex + 1]) * 1000);
    }

    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    this.expirations.delete(key);
    return this.values.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.values.has(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.values.get(key) ?? 0) + 1;
    this.values.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    if (!this.values.has(key)) return -2;
    const until = this.expirations.get(key);
    return until === undefined ? -1 : Math.max(1, Math.round((until - Date.now()) / 1000));
  }

  /** Только для тестов. */
  keys(): string[] {
    return [...this.values.keys()];
  }

  /** Только для тестов. */
  allValues(): string[] {
    return [...this.values.values()];
  }
}

function build(): { store: RedisChangeTokenStore; redis: FakeRedis } {
  const redis = new FakeRedis();
  return { store: new RedisChangeTokenStore(redis as unknown as Redis), redis };
}

function createParams(
  overrides: Partial<CreateContactChangeParams> = {},
): CreateContactChangeParams {
  return {
    keycloakId: 'kc-1',
    channel: 'email',
    target: 'new@example.com',
    oldTarget: null,
    requiresOldChallenge: false,
    newChallengeId: 'ch-new',
    oldChallengeId: null,
    ...overrides,
  };
}

describe('RedisChangeTokenStore (ADR-0017 §5)', () => {
  it('занимает слот активной смены атомарно: второй create → ContactChangeAlreadyPending', async () => {
    const { store, redis } = build();

    const first = await store.create(createParams());
    expect(first.token).toBeTruthy();
    expect(Math.round((first.expiresAt.getTime() - Date.now()) / 1000)).toBeCloseTo(
      CHANGE_TOKEN_TTL_SECONDS,
      -1,
    );

    await expect(store.create(createParams())).rejects.toThrow(ContactChangeAlreadyPendingError);
    expect(await store.hasActive('kc-1')).toBe(true);
  });

  it('хранит токен хешем: ни в ключах, ни в значениях открытого токена нет', async () => {
    const { store, redis } = build();
    const { token } = await store.create(createParams({ target: 'new@example.com' }));

    expect(redis.keys().some((key) => key.startsWith('auth:change:'))).toBe(true);
    expect(redis.keys().some((key) => key.includes(token))).toBe(false);
    expect(redis.allValues().some((value) => value.includes(token))).toBe(false);

    expect(await store.find(token)).toEqual({
      keycloakId: 'kc-1',
      channel: 'email',
      target: 'new@example.com',
      oldTarget: null,
      requiresOldChallenge: false,
      newChallengeId: 'ch-new',
      oldChallengeId: null,
      status: 'pending',
    });
    expect(await store.find('unknown-token')).toBeNull();
  });

  it('applied освобождает слот, но запись остаётся (идемпотентный повтор verify до TTL)', async () => {
    const { store } = build();
    const { token } = await store.create(createParams());

    await store.markApplied(token);

    expect(await store.hasActive('kc-1')).toBe(false);
    expect(await store.find(token)).toMatchObject({ status: 'applied' });
  });

  it('failed (компенсация не удалась) тоже освобождает слот и хранит причину', async () => {
    const { store } = build();
    const { token } = await store.create(createParams());

    await store.markFailed(token, 'shadow rollback failed');

    expect(await store.hasActive('kc-1')).toBe(false);
    expect(await store.find(token)).toMatchObject({
      status: 'failed',
      failureReason: 'shadow rollback failed',
    });
  });

  it('cancel удаляет и запись, и слот — можно начать смену заново', async () => {
    const { store } = build();
    const { token } = await store.create(createParams());

    await store.remove(token);

    expect(await store.find(token)).toBeNull();
    expect(await store.hasActive('kc-1')).toBe(false);
    await expect(store.create(createParams())).resolves.toMatchObject({ token: expect.any(String) });
  });

  it('лимит на пользователя: 10 смен за сутки, дальше retryAfterSeconds', async () => {
    const { store } = build();

    for (let i = 0; i < 10; i += 1) {
      expect(await store.consumeUserQuota('kc-1')).toEqual({ allowed: true });
    }
    const blocked = await store.consumeUserQuota('kc-1');
    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) throw new Error('expected quota to be exhausted');
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
