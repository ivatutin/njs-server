import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const SignOutSchema = z.object({
  refreshToken: z.string().min(1),
});

export class SignOutDto extends createZodDto(SignOutSchema) {}
