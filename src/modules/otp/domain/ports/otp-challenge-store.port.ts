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
   * Челлендж по `check_id` провайдера — нужен вебхуку: тело запроса не считается
   * доверенным (ADR-0014), но по нему мы находим *свою* заявку и перепроверяем
   * состояние авторизованным запросом к провайдеру.
   */
  findByProviderCheckId(providerCheckId: string): Promise<OtpChallenge | null>;

  /**
   * Id активного челленджа для пары (target, purpose) — чтобы инвалидировать
   * предыдущий при resend (race при повторной отправке).
   */
  findActiveId(target: string, purpose: OtpPurpose): Promise<string | null>;

  /**
   * Атомарно «забирает» право выдать `verificationToken` по челленджу (`SET NX`):
   * вебхук провайдера и polling фронта могут прийти одновременно, а токен должен
   * выдаваться ровно один раз (ADR-0014).
   */
  claimVerification(challengeId: string, ttlSeconds: number): Promise<boolean>;

  deleteById(challengeId: string): Promise<void>;
}
