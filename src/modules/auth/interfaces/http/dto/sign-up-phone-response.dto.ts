import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TokenPairSchema } from './token-pair-response.dto';
import { UserSchema } from './user.dto';

/** Ответ `POST /auth/sign-up/phone` (контракт v1.2): 201 → `{ user, tokens }`. */
export const SignUpPhoneResponseSchema = z.object({
  user: UserSchema,
  tokens: TokenPairSchema,
});

export class SignUpPhoneResponseDto extends createZodDto(SignUpPhoneResponseSchema) {}
