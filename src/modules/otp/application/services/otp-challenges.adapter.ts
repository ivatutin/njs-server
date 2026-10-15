import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OtpChallengeStart,
  OtpChallenges,
} from '@shared/application/otp-challenges.interface';
import { OtpChallenge } from '../../domain/entities/otp-challenge.entity';
import { OtpExpiredError } from '../../domain/errors/otp-expired.error';
import { OtpInvalidError } from '../../domain/errors/otp-invalid.error';
import { OtpRateLimitedError } from '../../domain/errors/otp-rate-limited.error';
import { generateOtpCode } from '../../domain/otp-code';
import { isOtpPurpose, OtpPurpose } from '../../domain/otp-policy';
import {
  OTP_CHALLENGE_STORE,
  OtpChallengeStore,
} from '../../domain/ports/otp-challenge-store.port';
import { EMAIL_SENDER, EmailSender } from '../../domain/ports/email-sender.port';
import { OTP_HASHER, OtpHasher } from '../../domain/ports/otp-hasher.port';
import { OTP_RATE_LIMITER, OtpRateLimiter } from '../../domain/ports/otp-rate-limiter.port';
import { SMS_SENDER, SmsSender } from '../../domain/ports/sms-sender.port';

/**
 * Реализация shared-порта `OTP_CHALLENGES` (ADR-0017 ред. 2): внутренние сценарии
 * (смена контакта) запускают челлендж и проверяют код сами, без `verificationToken`.
 *
 * Правила те же, что у публичного OTP-флоу: те же лимиты (per-target + per-IP), тот же
 * хеш кода, тот же счётчик попыток и TTL; отличается только результат — наружу отдаются
 * `challengeId`/`expiresAt`, а проверка идёт по паре `(target, purpose)`.
 */
@Injectable()
export class OtpChallengesAdapter implements OtpChallenges {
  constructor(
    @Inject(OTP_CHALLENGE_STORE) private readonly store: OtpChallengeStore,
    @Inject(OTP_RATE_LIMITER) private readonly rateLimiter: OtpRateLimiter,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasher,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async start(params: {
    channel: 'email' | 'phone';
    target: string;
    purpose: string;
    ip?: string | null;
  }): Promise<OtpChallengeStart> {
    const purpose = this.assertPurpose(params.purpose);

    const decision = await this.rateLimiter.consume({
      target: params.target,
      ip: params.ip ?? null,
    });
    if (!decision.allowed) throw new OtpRateLimitedError(decision.retryAfterSeconds);

    const code = generateOtpCode();
    const challenge = OtpChallenge.create({
      id: randomUUID(),
      channel: params.channel,
      target: params.target,
      purpose,
      codeHash: await this.hasher.hash(code),
    });
    await this.store.save(challenge);

    if (params.channel === 'email') {
      const delivery = await this.email.send({
        target: params.target,
        code,
        purpose,
        messageId: challenge.id,
      });
      if (!delivery.accepted) {
        // Канал недоступен (нет ключа провайдера либо отказ после ретраев) → 503,
        // челлендж не оставляем: код, который никуда не ушёл, не должен жить.
        await this.store.deleteById(challenge.id);
        throw new ServiceUnavailableException('Email delivery is unavailable');
      }
    } else {
      await this.sms.send({ target: params.target, code, purpose });
    }

    return { challengeId: challenge.id, expiresAt: challenge.expiresAt.toISOString() };
  }

  async verify(params: { target: string; purpose: string; code: string }): Promise<void> {
    const purpose = this.assertPurpose(params.purpose);

    // Ищем активный челлендж по паре (target, purpose): перевыпуск кода на том же контакте
    // не должен ломать уже начатую операцию.
    const activeId = await this.store.findActiveId(params.target, purpose);
    if (!activeId) throw new OtpExpiredError();

    const challenge = await this.store.findById(activeId);
    if (!challenge) throw new OtpExpiredError();
    if (challenge.method !== 'otp' || challenge.codeHash === null) throw new OtpInvalidError();

    challenge.ensureUsable();

    const matches = await this.hasher.verify(challenge.codeHash, params.code);
    if (!matches) {
      try {
        challenge.registerFailedAttempt();
      } finally {
        // Счётчик попыток сохраняем всегда, включая переход в лок.
        await this.store.save(challenge);
      }
      throw new OtpInvalidError();
    }

    await this.store.deleteById(challenge.id);
  }

  /** Порт принимает только сценарии OTP-контекста — неизвестный purpose это ошибка вызова. */
  private assertPurpose(purpose: string): OtpPurpose {
    if (!isOtpPurpose(purpose)) {
      throw new Error(`OTP_CHALLENGES: unknown purpose "${purpose}"`);
    }
    return purpose;
  }
}
