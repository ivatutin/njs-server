export const REAUTH_TOKEN_STORE = Symbol('REAUTH_TOKEN_STORE');

/** Срок жизни reauth-токена: ~5 минут (чек-лист Phase 4). */
export const REAUTH_TOKEN_TTL_SECONDS = 300;

/**
 * Одноразовые reauth-токены: подтверждают недавний ввод пароля для защищённых
 * операций (`contact-change`, `password`), поэтому клиент предъявляет их в
 * заголовке `X-Reauth-Token`.
 *
 * Токен привязан к пользователю (`keycloakId`) — предъявить его от другого
 * аккаунта нельзя, даже если он утёк; чтение одноразовое, TTL ограничен.
 */
export interface ReauthTokenStore {
  /** Выдаёт новый токен для пользователя. */
  issue(params: { keycloakId: string }): Promise<{ token: string; expiresAt: Date }>;

  /** Одноразовая проверка: `null` — токена нет, он использован или истёк. */
  consume(token: string): Promise<{ keycloakId: string } | null>;
}
