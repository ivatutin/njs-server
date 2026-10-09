export const OTP_HASHER = Symbol('OTP_HASHER');

/**
 * Хеширование OTP-кода: в Redis лежит только хеш (argon2id, ADR-0011).
 */
export interface OtpHasher {
  hash(code: string): Promise<string>;
  verify(codeHash: string, code: string): Promise<boolean>;
}
