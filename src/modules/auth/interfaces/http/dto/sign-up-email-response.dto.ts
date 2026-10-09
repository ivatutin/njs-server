/**
 * Пользователь в ответе регистрации — форма совпадает с `UserDto` контракта
 * (и с `UserResponseDto` user-модуля); `keycloakId` наружу не отдаём.
 */
export class SignUpUserDto {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Ответ `POST /auth/sign-up/email` (контракт v1.0): 201. */
export class SignUpEmailResponseDto {
  user: SignUpUserDto;
  verifyEmailSent: boolean;
}
