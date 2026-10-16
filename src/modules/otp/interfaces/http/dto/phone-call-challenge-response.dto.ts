import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Ответ `POST /auth/phone/call` (контракт v1.2). */
export const PhoneCallChallengeResponseSchema = z.object({
  challengeId: z.string(),
  channel: z.literal('phone'),
  /** Отличает звонковый челлендж от OTP-челленджа. */
  method: z.literal('call'),
  /** Номер, на который должен позвонить пользователь (общий сервисный). */
  callTo: z.string(),
  expiresAt: z.string(),
  cooldownSeconds: z.number(),
  /** SMS-код остаётся доступен тем же номером (`POST /auth/otp/send`). */
  otpFallback: z.literal(true),
});

export class PhoneCallChallengeResponseDto extends createZodDto(PhoneCallChallengeResponseSchema) {}
