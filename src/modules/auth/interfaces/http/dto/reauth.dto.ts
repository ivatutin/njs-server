import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /auth/reauth` (Phase 4): подтверждение пароля перед опасными операциями. */
const ReauthSchema = z.object({
  password: z.string().min(1),
});

export class ReauthDto extends createZodDto(ReauthSchema) {}
