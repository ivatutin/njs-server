import { OtpChallenge } from '../entities/otp-challenge.entity';
import { OtpPurpose } from '../otp-policy';

export const OTP_CHALLENGE_STORE = Symbol('OTP_CHALLENGE_STORE');

/**
 * Хранилище OTP-челленджей (реализация — Redis, TTL ≤ 5 минут).
 * Plaintext-код здесь не появляется: только хеш внутри агрегата.
 */
export interface OtpChallengeStore {
  /**
   * Сохраняет агрегат, вычисляя оставшийся TTL из `expiresAt` челленджа:
   * повторное сохранение (после неудачной попытки) НЕ продлевает жизнь кода.
   */
  save(challenge: OtpChallenge): Promise<void>;

  findById(challengeId: string): Promise<OtpChallenge | null>;

  /**
   * Id активного челленджа для пары (target, purpose) — чтобы инвалидировать
   * предыдущий при resend (race при повторной отправке).
   */
  findActiveId(target: string, purpose: OtpPurpose): Promise<string | null>;

  deleteById(challengeId: string): Promise<void>;
}
