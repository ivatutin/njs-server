/** DI token for the token blacklist storage. */
export const TOKEN_STORE = Symbol('TOKEN_STORE');

/**
 * Port for storing revoked access tokens until they naturally expire.
 * Used during sign-out: the access token can still be presented by clients,
 * so we keep it in a denylist with TTL equal to its remaining lifetime.
 */
export interface TokenStorePort {
  /** Mark token as revoked. TTL should equal remaining token lifetime. */
  blacklistToken(token: string, ttlSeconds: number): Promise<void>;

  /** Check whether a token has been previously blacklisted. */
  isTokenBlacklisted(token: string): Promise<boolean>;
}
