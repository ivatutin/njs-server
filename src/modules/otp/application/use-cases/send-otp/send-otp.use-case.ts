import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UseCase } from '@shared/application/use-case.interface';
import { CONTACT_LOOKUP, ContactLookup } from '@shared/application/contact-lookup.interface';
import { OtpChallenge } from '../../../domain/entities/otp-challenge.entity';
import { generateOtpCode } from '../../../domain/otp-code';
import { OTP_CODE_LENGTH, OTP_COOLDOWN_SECONDS, OtpChannel } from '../../../domain/otp-policy';
import { maskPhone } from '../../../domain/target-mask';
import { ContactAlreadyExistsError } from '../../../domain/errors/contact-already-exists.error';
import { OtpRateLimitedError } from '../../../domain/errors/otp-rate-limited.error';
import {
  OTP_CHALLENGE_STORE,
  OtpChallengeStore,
} from '../../../domain/ports/otp-challenge-store.port';
import { OTP_HASHER, OtpHasher } from '../../../domain/ports/otp-hasher.port';
import { OTP_RATE_LIMITER, OtpRateLimiter } from '../../../domain/ports/otp-rate-limiter.port';
import { SMS_SENDER, SmsSender } from '../../../domain/ports/sms-sender.port';
import { SendOtpCommand } from './send-otp.command';

/** Ответ `POST /auth/otp/send` (контракт v1.0). Target — уже замаскированный. */
export interface OtpChallengeResult {
  challengeId: string;
  channel: OtpChannel;
  target: string;
  expiresAt: string;
  cooldownSeconds: number;
  codeLength: number;
}

/**
 * Отправка OTP: лимиты → проверка контакта → генерация/хеширование кода →
 * сохранение челленджа → SMS.
 *
 * Anti-enumeration (контракт): для `purpose = 'sign-in'` ответ всегда 200 и
 * одинаков — челлендж создаётся в любом случае, SMS не уходит, если номера нет.
 * Для `purpose = 'sign-up'` занятый контакт — явная 409 (UX важнее скрытности).
 */
@Injectable()
export class SendOtpUseCase implements UseCase<SendOtpCommand, OtpChallengeResult> {
  constructor(
    @Inject(OTP_RATE_LIMITER) private readonly rateLimiter: OtpRateLimiter,
    @Inject(CONTACT_LOOKUP) private readonly contacts: ContactLookup,
    @Inject(OTP_CHALLENGE_STORE) private readonly store: OtpChallengeStore,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasher,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async execute(cmd: SendOtpCommand): Promise<OtpChallengeResult> {
    const decision = await this.rateLimiter.consume({ target: cmd.target, ip: cmd.ip });
    if (!decision.allowed) throw new OtpRateLimitedError(decision.retryAfterSeconds);

    const contactExists = await this.contacts.existsByPhone(cmd.target);
    if (cmd.purpose === 'sign-up' && contactExists) {
      throw new ContactAlreadyExistsError();
    }

    const code = generateOtpCode();
    const challenge = OtpChallenge.create({
      id: randomUUID(),
      channel: cmd.channel,
      target: cmd.target,
      purpose: cmd.purpose,
      codeHash: await this.hasher.hash(code),
    });
    await this.store.save(challenge);

    if (cmd.purpose !== 'sign-in' || contactExists) {
      await this.sms.send({ target: cmd.target, code, purpose: cmd.purpose });
    }

    return {
      challengeId: challenge.id,
      channel: challenge.channel,
      target: maskPhone(challenge.target),
      expiresAt: challenge.expiresAt.toISOString(),
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      codeLength: OTP_CODE_LENGTH,
    };
  }
}
