import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /users/me/contact-change/cancel` (контракт v1.3). */
const CancelContactChangeSchema = z.object({
  changeToken: z.string().min(1),
});

export class CancelContactChangeDto extends createZodDto(CancelContactChangeSchema) {}
