import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { OtpChallenge } from '../../../domain/entities/otp-challenge.entity';
import { CallStatus } from '../../../domain/otp-policy';
import {
  OTP_CHALLENGE_STORE,
  OtpChallengeStore,
} from '../../../domain/ports/otp-challenge-store.port';
import { PhoneCallRefresher } from '../../services/phone-call-refresher.service';
import { GetPhoneCallStatusCommand } from './get-phone-call-status.command';

/** Ответ `GET /auth/phone/call/:challengeId` (контракт v1.2: всегда 200 + `status`). */
export interface PhoneCallStatusResult {
  challengeId: string;
  status: CallStatus;
  verificationToken?: string;
  reason?: string;
}

/**
 * Состояние звонкового челленджа для фронта.
 *
 * Наблюдаемое поведение зафиксировано контрактом v1.2:
 * - неизвестный/вытесненный/истёкший челлендж → `{ status: 'expired' }` (не 404/422);
 * - подтверждённый → `{ status: 'verified', verificationToken }`, повтор отдаёт тот же токен;
 * - `pending`/`failed` — как есть.
 *
 * Опрос провайдера троттлится (`CALL_POLL_MIN_SECONDS`), чтобы polling фронта
 * не превращался в поток запросов к SMS.ru.
 */
@Injectable()
export class GetPhoneCallStatusUseCase implements UseCase<
  GetPhoneCallStatusCommand,
  PhoneCallStatusResult
> {
  constructor(
    @Inject(OTP_CHALLENGE_STORE) private readonly store: OtpChallengeStore,
    private readonly refresher: PhoneCallRefresher,
  ) {}

  async execute(cmd: GetPhoneCallStatusCommand): Promise<PhoneCallStatusResult> {
    const challenge = await this.store.findById(cmd.challengeId);
    if (!challenge || challenge.method !== 'call') {
      return { challengeId: cmd.challengeId, status: 'expired' };
    }

    const current = await this.refreshIfNeeded(challenge);
    return this.toResult(cmd.challengeId, current);
  }

  private async refreshIfNeeded(challenge: OtpChallenge): Promise<OtpChallenge> {
    if (this.refresher.isTerminal(challenge)) return challenge;
    if (challenge.isExpired()) return challenge;
    if (!challenge.shouldPollProvider()) return challenge;
    return this.refresher.refresh(challenge);
  }

  private toResult(challengeId: string, challenge: OtpChallenge): PhoneCallStatusResult {
    if (challenge.isVerified()) {
      return {
        challengeId,
        status: 'verified',
        verificationToken: challenge.verificationToken,
      };
    }
    if (challenge.failureReason !== undefined) {
      return { challengeId, status: 'failed', reason: challenge.failureReason };
    }
    if (challenge.isExpired() || challenge.providerStatus === 'expired') {
      return { challengeId, status: 'expired' };
    }
    return { challengeId, status: 'pending' };
  }
}
