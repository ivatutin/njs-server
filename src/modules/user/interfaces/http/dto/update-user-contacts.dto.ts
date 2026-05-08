import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

const UpdateUserContactsSchema = z
  .object({
    email: z.string().email().nullable().optional(),
    phone: z.string().regex(E164_REGEX, 'Phone must be in E.164 format').nullable().optional(),
  })
  .refine((data) => data.email !== undefined || data.phone !== undefined, {
    message: 'At least one of email or phone must be provided',
  });

export class UpdateUserContactsDto extends createZodDto(UpdateUserContactsSchema) {}
