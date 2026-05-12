/** DI token for the identity provider adapter (Keycloak in our case). */
export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export interface TokenClaims {
  /** Stable user id assigned by the identity provider. */
  sub: string;
  email: string;
  roles: string[];
}

/**
 * Port for external identity provider.
 * The auth module depends on this interface, never on a concrete adapter.
 * Implementations live in infrastructure/keycloak (or test mocks).
 */
export interface IdentityProviderPort {
  signIn(email: string, password: string): Promise<TokenPair>;
  refresh(refreshToken: string): Promise<TokenPair>;
  signOut(refreshToken: string): Promise<void>;
  verifyAccessToken(token: string): Promise<TokenClaims>;
}
