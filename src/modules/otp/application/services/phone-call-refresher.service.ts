import { Inject, Injectable, Logger } from '@nestjs/common';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { CallStatus, VERIFICATION_TOKEN_TTL_SECONDS } from '../../domain/otp-policy';
import {
  OTP_CHALLENGE_STORE,
  OtpChallengeStore,
} from '../../domain/ports/otp-challenge-store.port';
import {
  PHONE_CALL_PROVIDER,
  PhoneCallProvider,
} from '../../domain/ports/phone-call-provider.port';
import {
  VERIFICATION_TOKEN_ISSUER,
  VerificationTokenIssuer,
} from '../../domain/ports/verification-token.port';

/**
 * Опрос провайдера и фиксация результата звонкового челленджа (ADR-0014).
 * Общая часть двух входов: polling-эндпоинт фронта и вебхук провайдера.
 *
 * Идемпотентность: подтверждённый/отказавший челлендж повторно не опрашивается,
 * поэтому `verificationToken` выдаётся ровно один раз, а повторный GET отдаёт
 * уже сохранённый токен.
 */
@Injectable()
export class PhoneCallRefresher {
  private readonly logger = new Logger(PhoneCallRefresher.name);

  constructor(
    @Inject(OTP_CHALLENGE_STORE) private readonly store: OtpChallengeStore,
    @Inject(PHONE_CALL_PROVIDER) private readonly calls: PhoneCallProvider,
    @Inject(VERIFICATION_TOKEN_ISSUER) private readonly tokens: VerificationTokenIssuer,
  ) {}

  /** Терминальные состояния: дальше спрашивать провайдера не нужно. */
  isTerminal(challenge: OtpChallenge): boolean {
    return (
      challenge.isVerified() ||
      challenge.failureReason !== undefined ||
      challenge.providerStatus === 'expired'
    );
  }

  async refresh(challenge: OtpChallenge, now: Date = new Date()): Promise<OtpChallenge> {
    const providerCheckId = challenge.providerCheckId;
    if (!providerCheckId || this.isTerminal(challenge)) return challenge;

    let status: CallStatus;
    try {
      status = await this.calls.status(providerCheckId);
    } catch (cause) {
      // Сбой провайдера не должен ломать polling: оставляем последнее известное
      // состояние (обычно `pending`) и попробуем снова на следующем запросе.
      challenge.recordProviderCheck(challenge.providerStatus ?? 'pending', now);
      await this.store.save(challenge);
      this.logger.warn(`provider status check failed: ${describe(cause)}`);
      return challenge;
    }

    if (status === 'verified') {
      const claimed = await this.store.claimVerification(
        challenge.id,
        VERIFICATION_TOKEN_TTL_SECONDS,
      );
      if (!claimed) {
        // Параллельная проверка (вебхук + polling) уже выдала токен — читаем его.
        return (await this.store.findById(challenge.id)) ?? challenge;
      }
      const verificationToken = await this.tokens.issue({
        target: challenge.target,
        purpose: challenge.purpose,
      });
      challenge.markVerified(verificationToken, now);
    } else if (status === 'failed') {
      challenge.markFailed('provider rejected the verification', now);
    } else {
      challenge.recordProviderCheck(status, now);
    }

    await this.store.save(challenge);
    return challenge;
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
