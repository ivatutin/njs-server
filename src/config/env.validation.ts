import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_PORT: z.coerce.number().default(3000),
  APP_PATH_PREFIX: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  KEYCLOAK_URL: z.string().url(),
  KEYCLOAK_REALM: z.string(),
  KEYCLOAK_CLIENT_ID: z.string(),
  KEYCLOAK_CLIENT_SECRET: z.string(),
  // Ожидаемый issuer токенов; по умолчанию = KEYCLOAK_URL + /realms/ + KEYCLOAK_REALM
  KEYCLOAK_ISSUER: z.string().url().optional(),
  THROTTLE_TTL: z.coerce.number().default(60),
  THROTTLE_LIMIT: z.coerce.number().default(100),
  /**
   * TTL access-токена Keycloak — должен совпадать с настройкой реалма. Из него считается TTL метки отзыва
   * доступа (ADR-0018, C4), поэтому значение живёт в одном месте.
   */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(300),
  // Звонковая верификация телефона (SMS.ru callcheck, ADR-0014)
  SMSRU_API_ID: z.string().optional().default(''),
  SMSRU_CALLCHECK_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  SMSRU_API_BASE_URL: z.string().url().optional().default('https://sms.ru'),
  SMSRU_DEV_CONFIRM_AFTER_SECONDS: z.coerce.number().int().nonnegative().default(15),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.format();
    throw new Error(`Environment validation failed:\n${JSON.stringify(errors, null, 2)}`);
  }
  return result.data;
}
