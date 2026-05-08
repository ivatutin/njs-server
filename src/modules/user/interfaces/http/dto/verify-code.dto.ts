import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/**
 * DTO для verify endpoints. Принимает code, но он пока игнорируется
 * на уровне use case — реальная проверка кодов появится позже,
 * с отдельным bounded context Verification.
 */
const VerifyCodeSchema = z.object({
  code: z.string().min(1),
});

export class VerifyCodeDto extends createZodDto(VerifyCodeSchema) {}
