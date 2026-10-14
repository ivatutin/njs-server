import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhoneCallRefresher } from './application/services/phone-call-refresher.service';
import { GetPhoneCallStatusUseCase } from './application/use-cases/get-phone-call-status/get-phone-call-status.use-case';
import { RefreshPhoneCallStatusUseCase } from './application/use-cases/refresh-phone-call-status/refresh-phone-call-status.use-case';
import { SendOtpUseCase } from './application/use-cases/send-otp/send-otp.use-case';
import { StartPhoneCallUseCase } from './application/use-cases/start-phone-call/start-phone-call.use-case';
import { VerifyOtpUseCase } from './application/use-cases/verify-otp/verify-otp.use-case';
import { OTP_CHALLENGE_STORE } from './domain/ports/otp-challenge-store.port';
import { OTP_HASHER } from './domain/ports/otp-hasher.port';
import { OTP_RATE_LIMITER } from './domain/ports/otp-rate-limiter.port';
import { PHONE_CALL_PROVIDER, PhoneCallProvider } from './domain/ports/phone-call-provider.port';
import { SMS_SENDER } from './domain/ports/sms-sender.port';
import { VERIFICATION_TOKEN_ISSUER } from './domain/ports/verification-token.port';
import { ConsolePhoneCallProvider } from './infrastructure/call/console-phone-call.provider';
import { SmsRuCallcheckProvider } from './infrastructure/call/smsru-callcheck.provider';
import { Argon2OtpHasher } from './infrastructure/hashing/argon2-otp.hasher';
import { RedisOtpChallengeStore } from './infrastructure/persistence/redis-otp-challenge.store';
import { RedisOtpRateLimiter } from './infrastructure/rate-limit/redis-otp.rate-limiter';
import { ConsoleSmsSender } from './infrastructure/sms/console-sms.sender';
import { RedisVerificationTokenIssuer } from './infrastructure/tokens/redis-verification-token.issuer';
import { OtpController } from './interfaces/http/otp.controller';
import { PhoneCallController } from './interfaces/http/phone-call.controller';
import { SmsruCallbackController } from './interfaces/http/smsru-callback.controller';

/**
 * OTP-контекст (Phase 0 auth-suite) + звонковый канал верификации (Phase 2.5, ADR-0014).
 *
 * Провайдеры — только порты домена; конкретика (Redis, argon2id, dev-SMS, SMS.ru
 * callcheck) подставляется здесь, поэтому замена SMS-провайдера, звонкового
 * провайдера или хранилища не затрагивает application-слой.
 *
 * Оба канала делят челлендж-стор и один `verificationToken`: старт в любом канале
 * вытесняет предыдущий челлендж на `(target, purpose)` (кросс-канальное вытеснение).
 *
 * `CONTACT_LOOKUP` приходит из user-модуля через shared-порт — импорта модулей нет.
 * `VERIFICATION_TOKEN_ISSUER` пока не экспортируется: потребитель появится
 * в Phase 2 (sign-up/sign-in по phone), тогда же будет решён способ доступа
 * (отдельный shared-порт для consume, а не импорт модуля).
 */
@Module({
  controllers: [OtpController, PhoneCallController, SmsruCallbackController],
  providers: [
    SendOtpUseCase,
    VerifyOtpUseCase,
    StartPhoneCallUseCase,
    GetPhoneCallStatusUseCase,
    RefreshPhoneCallStatusUseCase,
    PhoneCallRefresher,
    { provide: OTP_CHALLENGE_STORE, useClass: RedisOtpChallengeStore },
    { provide: OTP_HASHER, useClass: Argon2OtpHasher },
    { provide: OTP_RATE_LIMITER, useClass: RedisOtpRateLimiter },
    { provide: VERIFICATION_TOKEN_ISSUER, useClass: RedisVerificationTokenIssuer },
    // DEV: код печатается в лог; в проде — Twilio/SMS.ru тем же токеном
    { provide: SMS_SENDER, useClass: ConsoleSmsSender },
    // Звонковый канал: боевой SMS.ru callcheck либо dev-заглушка (fail-closed в проде)
    SmsRuCallcheckProvider,
    ConsolePhoneCallProvider,
    {
      provide: PHONE_CALL_PROVIDER,
      inject: [ConfigService, SmsRuCallcheckProvider, ConsolePhoneCallProvider],
      useFactory: (
        config: ConfigService,
        smsru: SmsRuCallcheckProvider,
        dev: ConsolePhoneCallProvider,
      ): PhoneCallProvider => (config.get<boolean>('smsru.callcheckEnabled') ? smsru : dev),
    },
  ],
})
export class OtpModule {}
