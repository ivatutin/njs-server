import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const NAME_FIELD = z
  .string()
  .min(1, 'Must be 1-100 characters')
  .max(100, 'Must be 1-100 characters')
  .nullable();

export const UpdateUserProfileSchema = z
  .object({
    firstName: NAME_FIELD.optional(),
    lastName: NAME_FIELD.optional(),
  })
  .refine((data) => data.firstName !== undefined || data.lastName !== undefined, {
    message: 'At least one field must be provided',
  });

export class UpdateUserProfileDto extends createZodDto(UpdateUserProfileSchema) {}
