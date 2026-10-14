import { SignUpUserDto } from './sign-up-email-response.dto';
import { TokenPairResponseDto } from './token-pair-response.dto';

/** Ответ `POST /auth/sign-up/phone` (контракт v1.2): 201 → `{ user, tokens }`. */
export class SignUpPhoneResponseDto {
  user: SignUpUserDto;
  tokens: TokenPairResponseDto;
}
