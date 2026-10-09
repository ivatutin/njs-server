import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { OTP_PURPOSES } from '../../../domain/otp-policy';

/** `POST /auth/otp/send` — контракт v1.0. */
const SendOtpSchema = z.object({
  channel: z.literal('phone'),
  target: z.string().regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164'),
  purpose: z.enum(OTP_PURPOSES),
});

export class SendOtpDto extends createZodDto(SendOtpSchema) {}
