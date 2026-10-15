import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `POST /users/me/contact-change/request` (контракт v1.3). */
const RequestContactChangeSchema = z.object({
  /** Что меняем: email или телефон (уходит код на новое значение). */
  channel: z.enum(['email', 'phone']),
  /** Новое значение: нормализуется в user-контексте (email → lowercase, телефон → E.164). */
  newValue: z.string().min(3),
});

export class RequestContactChangeDto extends createZodDto(RequestContactChangeSchema) {}
