import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

const CreateUserSchema = z
  .object({
    keycloakId: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().regex(E164_REGEX, 'Phone must be in E.164 format').optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    roles: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => data.email !== undefined || data.phone !== undefined, {
    message: 'Either email or phone must be provided',
    path: ['email'],
  });

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
