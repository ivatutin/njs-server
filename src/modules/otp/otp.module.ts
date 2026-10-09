import { Module } from '@nestjs/common';
import { SendOtpUseCase } from './application/use-cases/send-otp/send-otp.use-case';
import { VerifyOtpUseCase } from './application/use-cases/verify-otp/verify-otp.use-case';
import { OTP_CHALLENGE_STORE } from './domain/ports/otp-challenge-store.port';
import { OTP_HASHER } from './domain/ports/otp-hasher.port';
import { OTP_RATE_LIMITER } from './domain/ports/otp-rate-limiter.port';
import { SMS_SENDER } from './domain/ports/sms-sender.port';
import { VERIFICATION_TOKEN_ISSUER } from './domain/ports/verification-token.port';
import { Argon2OtpHasher } from './infrastructure/hashing/argon2-otp.hasher';
import { RedisOtpChallengeStore } from './infrastructure/persistence/redis-otp-challenge.store';
import { RedisOtpRateLimiter } from './infrastructure/rate-limit/redis-otp.rate-limiter';
import { ConsoleSmsSender } from './infrastructure/sms/console-sms.sender';
import { RedisVerificationTokenIssuer } from './infrastructure/tokens/redis-verification-token.issuer';
import { OtpController } from './interfaces/http/otp.controller';

/**
 * OTP-контекст (Phase 0 auth-suite).
 *
 * Провайдеры — только порты домена; конкретика (Redis, argon2id, dev-SMS)
 * подставляется здесь, поэтому замена SMS-провайдера или хранилища
 * не затрагивает application-слой.
 *
 * `CONTACT_LOOKUP` приходит из user-модуля через shared-порт — импорта модулей нет.
 * `VERIFICATION_TOKEN_ISSUER` пока не экспортируется: потребитель появится
 * в Phase 2 (sign-up/sign-in по phone), тогда же будет решён способ доступа
 * (отдельный shared-порт для consume, а не импорт модуля).
 */
@Module({
  controllers: [OtpController],
  providers: [
    SendOtpUseCase,
    VerifyOtpUseCase,
    { provide: OTP_CHALLENGE_STORE, useClass: RedisOtpChallengeStore },
    { provide: OTP_HASHER, useClass: Argon2OtpHasher },
    { provide: OTP_RATE_LIMITER, useClass: RedisOtpRateLimiter },
    { provide: VERIFICATION_TOKEN_ISSUER, useClass: RedisVerificationTokenIssuer },
    // DEV: код печатается в лог; в проде — Twilio/SMS.ru тем же токеном
    { provide: SMS_SENDER, useClass: ConsoleSmsSender },
  ],
})
export class OtpModule {}
