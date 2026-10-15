/**
 * Claims of an access token, extracted by the identity provider adapter and
 * attached to the HTTP request by JwtAuthGuard.
 *
 * Живёт в shared kernel: тип нужен и auth-модулю (порт `IdentityProviderPort`),
 * и другим контекстам (`@CurrentUser` в user-модуле), а импорт "модуль → модуль"
 * в проекте запрещён.
 */
export interface TokenClaims {
  /** Stable user id assigned by the identity provider. */
  sub: string;
  /** `null` для phone-пользователей: email у них не обязателен (Phase 2). */
  email: string | null;
  roles: string[];
  /**
   * `iat` из токена в секундах. Нужен отзыву доступа (ADR-0018): guard отклоняет токены,
   * выданные раньше метки отзыва пользователя.
   */
  issuedAt: number;
}
