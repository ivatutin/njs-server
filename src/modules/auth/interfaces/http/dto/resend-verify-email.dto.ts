import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /auth/verify-email/resend` — контракт v1.0. Ответ всегда 202. */
const ResendVerifyEmailSchema = z.object({
  email: z.string().email(),
});

export class ResendVerifyEmailDto extends createZodDto(ResendVerifyEmailSchema) {}
