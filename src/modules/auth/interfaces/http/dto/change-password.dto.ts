import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /users/me/password` (Phase 4): смена пароля + `X-Reauth-Token`. */
const ChangePasswordSchema = z.object({
  newPassword: z.string().min(1),
});

export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
