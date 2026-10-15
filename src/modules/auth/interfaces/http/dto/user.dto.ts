/**
 * Пользователь в ответах auth-контекста — форма совпадает с `UserDto` контракта
 * (и с `UserResponseDto` user-модуля); `keycloakId` и `handle` наружу не отдаём
 * (handle — «несекретный, но непубличный», ADR-0020).
 */
export class UserDto {
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
