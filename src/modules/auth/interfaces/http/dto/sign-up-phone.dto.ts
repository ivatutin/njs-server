import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /auth/sign-up/phone` — контракт v1.0 (phone-регистрация, Phase 2). */
const SignUpPhoneSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164'),
  verificationToken: z.string().min(1),
  // Как и в email-регистрации: `boolean`, чтобы отказ от условий давал
  // доменный `TermsNotAccepted`, а не ошибку валидации.
  acceptedTerms: z.boolean(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

export class SignUpPhoneDto extends createZodDto(SignUpPhoneSchema) {}
