import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /users/me/contact-change/verify` (контракт v1.3). */
const VerifyContactChangeSchema = z.object({
  changeToken: z.string().min(1),
  newCode: z.string().min(1),
  /** Обязателен, когда `request` вернул `requiresOldChallenge: true`. */
  oldCode: z.string().min(1).optional(),
});

export class VerifyContactChangeDto extends createZodDto(VerifyContactChangeSchema) {}
