import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UseCase } from '@shared/application/use-case.interface';
import { CONTACT_LOOKUP, ContactLookup } from '@shared/application/contact-lookup.interface';
import { ContactAlreadyExistsError } from '@shared/domain/errors/contact-already-exists.error';
import { OtpChallenge } from '../../../domain/entities/otp-challenge.entity';
import { OTP_COOLDOWN_SECONDS, OtpChannel } from '../../../domain/otp-policy';
import { OtpRateLimitedError } from '../../../domain/errors/otp-rate-limited.error';
import {
  OTP_CHALLENGE_STORE,
  OtpChallengeStore,
} from '../../../domain/ports/otp-challenge-store.port';
import { OTP_RATE_LIMITER, OtpRateLimiter } from '../../../domain/ports/otp-rate-limiter.port';
import {
  PHONE_CALL_PROVIDER,
  PhoneCallProvider,
} from '../../../domain/ports/phone-call-provider.port';
import { StartPhoneCallCommand } from './start-phone-call.command';

/** Ответ `POST /auth/phone/call` (контракт v1.2). */
export interface PhoneCallChallengeResult {
  challengeId: string;
  channel: OtpChannel;
  method: 'call';
  callTo: string;
  expiresAt: string;
  cooldownSeconds: number;
  otpFallback: true;
}

/**
 * Старт звонковой верификации: лимиты → проверка контакта → заявка у провайдера
 * → челлендж в Redis (ADR-0014).
 *
 * Anti-enumeration (контракт): для `purpose = 'sign-in'` ответ всегда 200 и
 * одинаков — заявка создаётся и для незарегистрированного номера, иначе сам ответ
 * выдавал бы наличие аккаунта. Для `purpose = 'sign-up'` занятый контакт — 409.
 *
 * Провайдер недоступен/отказал → `503` без нового кода контракта; при этом
 * челлендж не создаётся (заявки у провайдера нет — подтверждать нечего).
 */
@Injectable()
export class StartPhoneCallUseCase implements UseCase<
  StartPhoneCallCommand,
  PhoneCallChallengeResult
> {
  constructor(
    @Inject(OTP_RATE_LIMITER) private readonly rateLimiter: OtpRateLimiter,
    @Inject(CONTACT_LOOKUP) private readonly contacts: ContactLookup,
    @Inject(OTP_CHALLENGE_STORE) private readonly store: OtpChallengeStore,
    @Inject(PHONE_CALL_PROVIDER) private readonly calls: PhoneCallProvider,
  ) {}

  async execute(cmd: StartPhoneCallCommand): Promise<PhoneCallChallengeResult> {
    const decision = await this.rateLimiter.consume({ target: cmd.target, ip: cmd.ip });
    if (!decision.allowed) throw new OtpRateLimitedError(decision.retryAfterSeconds);

    const contactExists = await this.contacts.existsByPhone(cmd.target);
    if (cmd.purpose === 'sign-up' && contactExists) {
      throw new ContactAlreadyExistsError();
    }

    const started = await this.calls.start({ phone: cmd.target, userIp: cmd.ip });
    if (!started || !started.callTo) {
      throw new ServiceUnavailableException('Phone verification provider is unavailable');
    }

    // Тот же ключ активного челленджа, что у OTP: старт в любом канале вытесняет
    // предыдущий челлендж на (target, purpose) — кросс-канальное вытеснение (ADR-0014).
    const challenge = OtpChallenge.createCall({
      id: randomUUID(),
      channel: cmd.channel,
      target: cmd.target,
      purpose: cmd.purpose,
      providerCheckId: started.providerCheckId,
      callTo: started.callTo,
    });
    await this.store.save(challenge);

    return {
      challengeId: challenge.id,
      channel: challenge.channel,
      method: 'call',
      callTo: started.callTo,
      expiresAt: challenge.expiresAt.toISOString(),
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      otpFallback: true,
    };
  }
}
