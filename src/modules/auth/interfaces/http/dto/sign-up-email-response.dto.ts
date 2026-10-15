import { UserDto } from './user.dto';

/**
 * Пользователь в ответе регистрации — та же форма, что `UserDto` контракта
 * (класс живёт в `user.dto.ts`, здесь — обратная совместимость имени).
 */
export { UserDto as SignUpUserDto } from './user.dto';
/** Ответ `POST /auth/sign-up/email` (контракт v1.0): 201. */
export class SignUpEmailResponseDto {
  user: UserDto;
  verifyEmailSent: boolean;
}
