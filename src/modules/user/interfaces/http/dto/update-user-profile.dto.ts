import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const UpdateUserProfileSchema = z
  .object({
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
  })
  .refine((data) => data.firstName !== undefined || data.lastName !== undefined, {
    message: 'At least one field must be provided',
  });

export class UpdateUserProfileDto extends createZodDto(UpdateUserProfileSchema) {}
