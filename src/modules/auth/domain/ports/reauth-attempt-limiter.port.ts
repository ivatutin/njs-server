export const REAUTH_ATTEMPT_LIMITER = Symbol('REAUTH_ATTEMPT_LIMITER');

/** Решение по лимиту неудачных подтверждений пароля. */
export type ReauthAttemptDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Brute-force защита `POST /auth/reauth` (решение координатора 15.10.2026):
 * **5 неудачных подтверждений пароля на пользователя за 15 минут**, успех сбрасывает счётчик.
 *
 * Считаем только **неудачи**: успешные подтверждения не должны приближать блокировку.
 * Ответ на исчерпанный лимит — `401 InvalidCredentials`, а не отдельный код: проект не даёт
 * оракула «тебя заблокировали» (тот же принцип, что у anti-enumeration в sign-in/sign-up),
 * поэтому контракт v1.3 не меняется; сам факт троттлинга виден в логах маркером `reauth_throttled`.
 */
export interface ReauthAttemptLimiter {
  /** Проверка перед обращением к Keycloak (без инкремента). */
  check(keycloakId: string): Promise<ReauthAttemptDecision>;

  /** Фиксирует неудачное подтверждение пароля. */
  registerFailure(keycloakId: string): Promise<void>;

  /** Сбрасывает счётчик после успешного подтверждения. */
  reset(keycloakId: string): Promise<void>;
}
