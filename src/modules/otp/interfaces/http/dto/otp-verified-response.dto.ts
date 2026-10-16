import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Ответ `POST /auth/otp/verify` (контракт v1.0). */
export const OtpVerifiedResponseSchema = z.object({
  challengeId: z.string(),
  verified: z.literal(true),
  verificationToken: z.string(),
});

export class OtpVerifiedResponseDto extends createZodDto(OtpVerifiedResponseSchema) {}
