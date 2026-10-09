import { OtpPurpose } from '../otp-policy';

export const VERIFICATION_TOKEN_ISSUER = Symbol('VERIFICATION_TOKEN_ISSUER');

/** К чему привязан verificationToken. */
export interface VerificationTokenPayload {
  target: string;
  purpose: OtpPurpose;
}

/**
 * Короткоживущий (10 мин) одноразовый токен, подтверждающий владение target.
 * Выдаётся после успешного verify и предъявляется вместо повторного OTP:
 * Phase 2 — sign-up/phone и sign-in/phone, Phase 4 — set-password.
 */
export interface VerificationTokenIssuer {
  issue(payload: VerificationTokenPayload): Promise<string>;

  /** Одноразовое чтение: токен удаляется при первом использовании. */
  consume(token: string): Promise<VerificationTokenPayload | null>;
}
