import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { OtpExpiredError } from '../../../domain/errors/otp-expired.error';
import { OtpInvalidError } from '../../../domain/errors/otp-invalid.error';
import {
  OTP_CHALLENGE_STORE,
  OtpChallengeStore,
} from '../../../domain/ports/otp-challenge-store.port';
import { OTP_HASHER, OtpHasher } from '../../../domain/ports/otp-hasher.port';
import {
  VERIFICATION_TOKEN_ISSUER,
  VerificationTokenIssuer,
} from '../../../domain/ports/verification-token.port';
import { VerifyOtpCommand } from './verify-otp.command';

/** Ответ `POST /auth/otp/verify` (контракт v1.0). */
export interface OtpVerificationResult {
  challengeId: string;
  verified: true;
  verificationToken: string;
}

/**
 * Проверка OTP: неверный код увеличивает счётчик попыток (5 → лок,
 * `OtpTooManyAttempts`), успех инвалидирует челлендж и выдаёт
 * одноразовый `verificationToken`.
 */
@Injectable()
export class VerifyOtpUseCase implements UseCase<VerifyOtpCommand, OtpVerificationResult> {
  constructor(
    @Inject(OTP_CHALLENGE_STORE) private readonly store: OtpChallengeStore,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasher,
    @Inject(VERIFICATION_TOKEN_ISSUER) private readonly tokens: VerificationTokenIssuer,
  ) {}

  async execute(cmd: VerifyOtpCommand): Promise<OtpVerificationResult> {
    const challenge = await this.store.findById(cmd.challengeId);
    if (!challenge) throw new OtpExpiredError();

    challenge.ensureUsable();

    const matches = await this.hasher.verify(challenge.codeHash, cmd.code);
    if (!matches) {
      try {
        challenge.registerFailedAttempt();
      } finally {
        // счётчик попыток сохраняем в любом случае, включая переход в лок
        await this.store.save(challenge);
      }
      throw new OtpInvalidError();
    }

    await this.store.deleteById(challenge.id);

    const verificationToken = await this.tokens.issue({
      target: challenge.target,
      purpose: challenge.purpose,
    });

    return { challengeId: challenge.id, verified: true, verificationToken };
  }
}
