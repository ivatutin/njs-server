import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /auth/sign-in/phone` — контракт v1.0 (phone-вход, Phase 2). */
const SignInPhoneSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164'),
  /** `verificationToken` с `purpose = 'sign-in'` (OTP-код или обратный звонок). */
  verificationToken: z.string().min(1),
});

export class SignInPhoneDto extends createZodDto(SignInPhoneSchema) {}
