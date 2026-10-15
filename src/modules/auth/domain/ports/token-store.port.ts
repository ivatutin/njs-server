/** DI token for the token blacklist / revocation storage. */
export const TOKEN_STORE = Symbol('TOKEN_STORE');

/**
 * Порт хранилища отозванных доступов (ADR-0018).
 *
 * Два независимых механизма:
 * - **блоклист конкретного токена** — используется `sign-out` (выход только на этом устройстве);
 * - **метка отзыва по пользователю** (`sub`) — «все токены, выданные до X, мертвы»; ставится только неделимым
 *   юзкейсом `RevokeUserAccessUseCase`, который сначала гасит сессии Keycloak.
 */
export interface TokenStorePort {
  /** Помечает конкретный токен отозванным. TTL = остаток жизни токена. */
  blacklistToken(token: string, ttlSeconds: number): Promise<void>;

  /**
   * Помечает всех пользователей-токены отозванными: всё, что выдано **раньше** этого момента, недействительно.
   * TTL = TTL access-токена + запас (ADR-0018, C4).
   */
  revokeUserTokens(sub: string, ttlSeconds: number): Promise<void>;

  /**
   * Проверка на горячем пути guard'а: блоклист токена **и** метка отзыва по `sub` одним MGET.
   * `issuedAt` — значение `iat` из claims (в секундах).
   */
  isAccessRevoked(params: { token: string; sub: string; issuedAt: number }): Promise<boolean>;
}
