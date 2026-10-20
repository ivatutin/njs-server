import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { KeycloakAdminClient } from '@shared/infrastructure/keycloak/keycloak-admin.client';

/** DI-токен прогрева JWKS: сервис не зависит от конкретного верификатора (и его ESM-зависимостей). */
export const JWKS_WARMUP = Symbol('JWKS_WARMUP');

/** Что умеет прогреваться: сейчас это `KeycloakJwtVerifier`. */
export interface WarmupTarget {
  warmUp(): Promise<void>;
}

/** Сколько ждём прогрев одного канала: при недоступном Keycloak старт не должен висеть. */
const WARMUP_TIMEOUT_MS = 5_000;

/**
 * Прогрев «холодного» пути авторизации (batch-3).
 *
 * Живой факт: первый `sign-up/phone` после простоя занимал **>30 с** (клиент обрывал по таймауту 30 с,
 * а бэкенд операцию доводил), повторный — 6.5 с. Часть этой разницы — разовые затраты, которые
 * не зависят от запроса и легко снимаются при старте:
 *
 * 1. **service-account токен Keycloak** (client_credentials): первый минт идёт через только что
 *    поднявшийся Keycloak (инициализация реалма, TLS-хендшейк) — его платит любой админ-вызов,
 *    включая `createPhoneUser` в `sign-up/phone`;
 * 2. **JWKS** (`/realms/{realm}/protocol/openid-connect/certs`): первое чтение ключей происходит
 *    на первом запросе с токеном — в phone-флоу это callback CIBA-канала на наш `/internal/ciba/channel`;
 * 3. Prisma соединяется сама в `PrismaService.onModuleInit`.
 *
 * Что прогрев **не** убирает (структурный пол, а не дефект): минт токенов по CIBA всегда ждёт
 * `interval` из ответа `backchannel-auth` (по умолчанию 5 с) перед первой попыткой
 * `exchange`, поэтому тёплый `sign-up/phone` ≈ 5–7 с.
 *
 * Ошибки прогрева не валят старт: Keycloak может быть ещё не готов — приложение обязано подняться,
 * а «холодная» цена просто останется на первом запросе.
 */
@Injectable()
export class AuthWarmupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthWarmupService.name);

  constructor(
    private readonly adminClient: KeycloakAdminClient,
    @Inject(JWKS_WARMUP) private readonly verifier: WarmupTarget,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.warm('keycloak admin token', () => this.adminClient.warmUp());
    await this.warm('keycloak JWKS', () => this.verifier.warmUp());
  }

  private async warm(label: string, fn: () => Promise<void>): Promise<void> {
    const started = Date.now();
    try {
      await withTimeout(fn(), WARMUP_TIMEOUT_MS);
      this.logger.log(`${label} warmed in ${Date.now() - started} ms`);
    } catch (err) {
      this.logger.warn(
        `${label} warm-up failed (cold path stays slower): ${(err as Error).message}`,
      );
    }
  }
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
