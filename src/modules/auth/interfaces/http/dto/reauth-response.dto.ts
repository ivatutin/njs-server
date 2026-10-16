import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Ответ `POST /auth/reauth`: одноразовый токен на ~5 минут. */
export const ReauthResponseSchema = z.object({
  reauthToken: z.string(),
  /** ISO-строка. */
  expiresAt: z.string(),
});

export class ReauthResponseDto extends createZodDto(ReauthResponseSchema) {}
