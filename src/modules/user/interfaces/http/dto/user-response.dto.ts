import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Public-facing user representation. Схема (а не TS-класс) — чтобы Swagger генерировал
 * `properties`: без Zod у response-DTO их не было (см. `handover/backend-batch-2.md`).
 */
export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  roles: z.array(z.string()),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export class UserResponseDto extends createZodDto(UserResponseSchema) {}
