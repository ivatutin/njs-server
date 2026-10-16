import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Ответ `POST /auth/otp/send` (контракт v1.0). `target` — замаскированный. */
export const OtpChallengeResponseSchema = z.object({
  challengeId: z.string(),
  channel: z.literal('phone'),
  target: z.string(),
  expiresAt: z.string(),
  cooldownSeconds: z.number(),
  codeLength: z.number(),
});

export class OtpChallengeResponseDto extends createZodDto(OtpChallengeResponseSchema) {}
