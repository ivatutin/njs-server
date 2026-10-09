import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/**
 * `POST /auth/sign-up/email` — контракт v1.0.
 * `acceptedTerms` валидируем как boolean (а не `literal(true)`), чтобы отказ от
 * условий давал контрактный `422 TermsNotAccepted`, а не 400 от валидатора.
 */
const SignUpEmailSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  acceptedTerms: z.boolean(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

export class SignUpEmailDto extends createZodDto(SignUpEmailSchema) {}
