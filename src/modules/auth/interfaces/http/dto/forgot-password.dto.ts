import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /auth/forgot-password` — контракт v1.0 (Phase 1.5). Ответ всегда 202. */
const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}
