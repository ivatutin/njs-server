import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /users/me/set-password` (Phase 4): пароль для passwordless-пользователя. */
const SetPasswordSchema = z.object({
  /** С `purpose='set-password'`, выдан после подтверждения телефона/email. */
  verificationToken: z.string().min(1),
  newPassword: z.string().min(1),
});

export class SetPasswordDto extends createZodDto(SetPasswordSchema) {}
