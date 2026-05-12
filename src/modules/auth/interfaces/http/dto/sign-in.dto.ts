import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export class SignInDto extends createZodDto(SignInSchema) {}
