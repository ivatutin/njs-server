import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { OTP_PURPOSES } from '../../../domain/otp-policy';

/** `POST /auth/phone/call` — контракт v1.2. */
const StartPhoneCallSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164'),
  purpose: z.enum(OTP_PURPOSES),
});

export class StartPhoneCallDto extends createZodDto(StartPhoneCallSchema) {}
