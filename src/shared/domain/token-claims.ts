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
  email: string;
  roles: string[];
}
