import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Пользователь в ответах контекста — форма совпадает с `UserDto` контракта
 * (и с `UserResponseDto` user-модуля); `keycloakId` и `handle` наружу не отдаём
 * (handle — «несекретный, но непубличный», ADR-0020).
 *
 * Схема, а не просто TS-класс: Swagger генерирует `properties` только из Zod
 * (`createZodDto`) — пустые схемы ответов были ровно из-за отсутствия схемы.
 */
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  roles: z.array(z.string()),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export class UserDto extends createZodDto(UserSchema) {}
