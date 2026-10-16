import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Пара токенов (контракт v1.0). Схема — чтобы Swagger видел поля (иначе `properties` пусты). */
export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export class TokenPairResponseDto extends createZodDto(TokenPairSchema) {}
