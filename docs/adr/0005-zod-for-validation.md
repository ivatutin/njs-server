# ADR 0005: Zod для валидации DTO и env

- **Дата:** 2026-04-14
- **Статус:** Accepted

## Контекст

Валидация входных данных требуется в двух местах:

1. **HTTP DTO** — данные из запросов клиентов
2. **Environment variables** — конфигурация при старте приложения

Цели:
- Одна точка правды для типа и валидации (без дублирования)
- Поддержка кросс-полевых правил (например, "хотя бы один из email/phone")
- Автоматический вывод TypeScript-типов
- Интеграция со Swagger (OpenAPI генерация из схем)

Кандидаты:

1. **class-validator + class-transformer** — стандарт в NestJS экосистеме
2. **Zod** — runtime + compile-time валидация на TypeScript
3. **Joi** — runtime валидация без типов
4. **Yup** — близкий к Zod, более старый
5. **Valibot** — новый, ультра-лёгкий

## Решение

**Zod 4** + `nestjs-zod` для интеграции с NestJS. Используется **везде**:
- DTO (`createZodDto(schema)`) с `ZodValidationPipe` глобально
- Env validation (`config/env.validation.ts`)
- OpenAPI генерация через `cleanupOpenApiDoc(SwaggerModule.createDocument(...))`

## Последствия

### Положительные

- **Один источник правды.** Схема описывает и runtime validation, и TypeScript-тип:
  ```ts
  const schema = z.object({ email: z.string().email() });
  type Input = z.infer<typeof schema>;  // { email: string }
  ```
  Невозможна ситуация, когда TS-тип и реальная проверка расходятся.

- **Кросс-полевая валидация естественна:**
  ```ts
  z.object({ email: z.string().email().optional(), phone: z.string().optional() })
    .refine(d => d.email || d.phone, 'Either email or phone required');
  ```
  В class-validator для того же требовался custom validator class.

- **Композиция схем:** `.merge()`, `.extend()`, `.partial()`, `.pick()`, `.omit()` — удобно для variants одной модели.

- **Та же библиотека для env.** Не нужно тащить две зависимости (class-validator для DTO + другую для env) — одна Zod покрывает оба сценария.

- **Интеграция с Swagger.** `nestjs-zod` через `cleanupOpenApiDoc` автоматически конвертирует Zod-схемы в OpenAPI-схемы со **всеми правилами валидации** (regex, format, required). См. [ADR 0006](./0006-swagger-from-zod-schemas.md).

- **Хорошее качество ошибок.** Zod возвращает массив issues с path, expected, message — это структурировано отдаётся клиенту через нашу `details` секцию в response (`AllExceptionsFilter`).

### Отрицательные

- **Менее распространён в NestJS** чем class-validator. Большинство NestJS-туториалов используют class-validator.
- **`createZodDto` синтаксис** менее стандартен — требует понимания, что `class CreateUserDto extends createZodDto(schema) {}` это **класс**, не интерфейс (нужно для NestJS DI и Swagger).
- **Zod 4 — breaking changes от Zod 3.** `nestjs-zod` 5+ требует Zod 4. Несовместимость со старыми примерами в интернете.

## Альтернативы

### class-validator + class-transformer (отвергнуто)

Стандартный выбор в NestJS-туториалах.

**Почему нет:**
- **Дублирование информации.** TS-тип в классе декларируется отдельно от декораторов:
  ```ts
  class CreateUserDto {
    @IsEmail()  // runtime
    email: string;  // compile-time
  }
  ```
  Можно убрать `@IsEmail()` и runtime-проверки не будет, но компилятор не предупредит.
- **Кросс-полевая валидация** требует custom validator class — много кода для простого правила
- **Нет автоматической интеграции с OpenAPI** для условий типа `regex`. Нужны отдельные `@ApiProperty({ pattern: ... })` — снова дублирование.
- **Не подходит для env** — он рассчитан на классы, env это plain object → требуется отдельная библиотека.

### Joi (отвергнуто)

Популярная в чисто-JavaScript мире.

**Почему нет:**
- Нет автоматического вывода TypeScript-типов — типы пишутся отдельно
- Нет тесной интеграции с NestJS

### Yup (отвергнуто)

Близкий к Zod, но более старый.

**Почему нет:**
- Zod имеет лучшие type inference и более активное развитие
- Сообщество в Node.js backend двигается к Zod

### Valibot (отвергнуто)

Ультра-лёгкий, tree-shakeable, новый.

**Почему нет на этом этапе:**
- Слишком молодой (на момент решения)
- `nestjs-zod` имеет готовую интеграцию, для Valibot её нет
- **Возможный пересмотр позже** если bundle size станет важен

## Правила использования

### DTO

```ts
// create-user.dto.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const Schema = z.object({
  keycloakId: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
}).refine(d => d.email !== undefined || d.phone !== undefined, {
  message: 'Either email or phone must be provided',
  path: ['email'],
});

export class CreateUserDto extends createZodDto(Schema) {}
```

Используется в controller как обычный DTO:
```ts
@Post()
async create(@Body() dto: CreateUserDto) { ... }
```

`ZodValidationPipe` глобально (см. `main.ts`) автоматически валидирует и возвращает 400 с `details` массивом.

### Env

```ts
// config/env.validation.ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  // ...
});

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Environment validation failed: ${JSON.stringify(result.error.format(), null, 2)}`);
  }
  return result.data;
}
```

Передаётся в `ConfigModule.forRoot({ validate })`. **Приложение падает на старте** при некорректном env.

### Output DTO

Output DTO (например `UserResponseDto`) — **обычный класс**, не Zod. Output не валидируется, его цель — задокументировать форму ответа. Mapper (`UserHttpMapper.toResponse`) обеспечивает форму.

## Ссылки

- [Zod docs](https://zod.dev)
- [nestjs-zod](https://github.com/risen228/nestjs-zod)
- Сравнение: [Zod vs Yup vs Joi](https://github.com/colinhacks/zod/blob/master/README.md#comparison)
