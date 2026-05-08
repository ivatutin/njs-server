# CLAUDE.md — инструкции для Claude

> Этот файл автоматически подгружается в контекст при работе с проектом. Здесь — архитектурные правила, особенности проекта и текущее состояние.

---

## Роль

Ты — **senior backend-архитектор и DevOps-инженер**.

Задача — спроектировать и реализовать масштабируемое backend-приложение на стеке:

* NestJS
* TypeScript
* PostgreSQL
* Redis
* Keycloak (аутентификация)
* Docker
* CI/CD

---

## 1. Архитектурный стиль

* Modular Monolith
* Domain-Driven Design (DDD)
* Hexagonal Architecture (Ports & Adapters)
* Feature-first структура — деление по бизнес-доменам, **не** по слоям

---

## 2. Базовые правила (СТРОГО)

* Каждый модуль = отдельный bounded context (например, `User`, `Auth`, `Billing`)
* **Никакой общей бизнес-логики между модулями**
* **Никаких прямых импортов между модулями**
* Коммуникация **только через**:
  * use cases
  * domain events

Каждый модуль обязан содержать:

* `domain/`
* `application/`
* `infrastructure/`
* `interfaces/`

---

## 3. Правила domain-слоя

Domain-слой **НЕ должен зависеть** от:

* NestJS
* БД
* HTTP
* внешних сервисов

Domain-слой **обязан содержать**:

* entities
* value objects
* domain events
* domain services

---

## 4. Application-слой

* Только **use cases**
* Зависит от **интерфейсов (портов)**, а не от реализаций

---

## 5. Infrastructure-слой

* Реализует интерфейсы
* Содержит:
  * репозитории
  * внешние интеграции (например, Keycloak)
  * messaging (готовый к будущему расширению)

---

## 6. Interfaces-слой

* Controllers (HTTP)
* DTO
* Mappers

---

## 7. Аутентификация

* Keycloak как внешний identity provider
* Использовать паттерн **Adapter**
* **НЕ допускать утечки Keycloak-специфики за пределы auth-модуля**

---

## 8. База данных

* PostgreSQL
* Единая БД, логически разделённая по модулям (через PostgreSQL schemas)
* **Никакого cross-module доступа** к таблицам других модулей

---

## 9. События

* Event-driven архитектура внутри монолита
* Начинаем с in-memory event bus
* Должен быть **заменяем на RabbitMQ** в будущем без изменений в domain/application

---

## 10. Docker (ОБЯЗАТЕЛЬНО)

Должны быть:

* Multi-stage Dockerfile для NestJS-приложения
* `docker-compose.yml` с сервисами:
  * app
  * PostgreSQL
  * Redis
  * Keycloak

Требования:

* Использовать переменные окружения из `.env`
* Раздельные конфиги для dev и prod
* Healthchecks для всех сервисов
* Named volumes для персистентности

---

## 11. CI/CD (ОБЯЗАТЕЛЬНО)

CI/CD pipeline (предпочтительно GitHub Actions).

### Стадии пайплайна:

1. Install dependencies
2. Lint
3. Unit tests
4. Build project
5. Build Docker image
6. (Опционально) Push image в registry

### Требования:

* Кэширование зависимостей
* Fail fast при ошибках
* Node.js LTS
* Раздельные workflow для:
  * pull requests
  * main branch

---

## 12. Управление окружением

* Использовать `.env` файлы
* Предоставлять:
  * `.env.example`
  * config-модуль
* **Никогда не хардкодить секреты**

---

## 13. Логирование и observability (базовый уровень)

* Structured logging (предпочтительно JSON)
* Централизованный логгер (NestJS logger или эквивалент)
* Слой обработки ошибок

---

## 14. Чего НЕ делать (КРИТИЧНО)

* Никакого Kubernetes
* Никаких микросервисов
* Никакого оверинжиниринга
* Никакой глобальной общей бизнес-логики
* Никакого прямого доступа к БД между модулями
* Никакой утечки фреймворка в domain-слой

---

## 15. Формат вывода кода

При генерации кода:

* Показывать полные пути файлов
* Соблюдать единую структуру
* Кратко объяснять ключевые решения
* Ориентироваться на production-ready паттерны

---

## Первоначальная задача

1. Сгенерировать полную структуру проекта
2. Реализовать:
   * User module (DDD)
   * Auth module (Keycloak adapter)
   * In-memory event bus
3. Предоставить:
   * Dockerfile
   * docker-compose.yml
   * .env.example
4. Создать CI/CD pipeline (GitHub Actions)

Всё должно быть **чистым, минимальным и масштабируемым**.

---

# Контекст текущего проекта

## Стек и версии

| Компонент | Версия | Примечание |
|---|---|---|
| Node.js | 20 LTS | в Docker — alpine |
| NestJS | 11 | |
| TypeScript | **5.9.3** | НЕ 6.x — TS6 ломает `baseUrl`/`paths` |
| Prisma | **7.7.0** | важные особенности — см. ниже |
| PostgreSQL | 16-alpine | |
| Redis | 7-alpine | |
| Keycloak | 24 | quay.io/keycloak/keycloak:24.0 |
| Package manager | **npm** | |
| Builder | **SWC** | в `nest-cli.json`, не tsc — нужен для NestJS 11 + watch |
| Логгер | nestjs-pino (план) | |
| Валидация env | zod + @nestjs/config | |

---

## Особенности этого проекта (важно учитывать)

### Prisma 7 (отличается от Prisma 5/6)
- `url` хранится **в `prisma.config.ts`**, НЕ в `schema.prisma`
- `multiSchema` теперь **stable**, не нужно `previewFeatures`
- Генератор: `provider = "prisma-client"` (новый), `output = "../generated/prisma"`
- **Импорт `PrismaClient` из `./generated/prisma`**, НЕ из `@prisma/client`!
- Перед компиляцией TS: `npx prisma generate` (либо автоматически при `migrate dev`)

### Доменные особенности модели User
- `email` и `phone` — **оба опциональные, но уникальные если заполнены** (нативный UNIQUE в Postgres работает с NULL правильно)
- **Доменный инвариант:** хотя бы один из них должен быть заполнен → `Error('User must have email or phone')`
- На уровне БД — **CHECK constraints** (defense in depth, добавляются вручную в первой миграции):
  ```sql
  -- 1. Хотя бы один контакт заполнен
  ALTER TABLE "user"."users"
    ADD CONSTRAINT users_email_or_phone_required
    CHECK (email IS NOT NULL OR phone IS NOT NULL);

  -- 2. verified_at можно ставить только если контакт заполнен
  ALTER TABLE "user"."users"
    ADD CONSTRAINT users_email_verified_requires_email
    CHECK (email_verified_at IS NULL OR email IS NOT NULL);

  ALTER TABLE "user"."users"
    ADD CONSTRAINT users_phone_verified_requires_phone
    CHECK (phone_verified_at IS NULL OR phone IS NOT NULL);

  -- 3. status='active' требует хотя бы один verified контакт
  ALTER TABLE "user"."users"
    ADD CONSTRAINT users_active_requires_verified_contact
    CHECK (
      status != 'active'
      OR email_verified_at IS NOT NULL
      OR phone_verified_at IS NOT NULL
    );
  ```
- `Phone` VO валидирует **E.164** (`/^\+[1-9]\d{7,14}$/`)

### Жизненный цикл User (с верификацией контактов)

```
[create] → status: pending_verification
              ↓ verifyEmail() или verifyPhone()
           status: active  (хотя бы один verified контакт)
              ↓ suspend()
           status: suspended
              ↓ activate()
           status: active
```

**Поля верификации:** `emailVerifiedAt: Date | null`, `phoneVerifiedAt: Date | null`. NULL = не подтверждён, иначе timestamp подтверждения.

**Бизнес-правила:**
- При `User.create()` пользователь всегда `pending_verification`, контакты не подтверждены
- При первом `verifyEmail()`/`verifyPhone()` — auto-переход в `active` (эмитится `UserActivatedEvent`)
- `verifyEmail/verifyPhone` идемпотентны — повторный вызов silent return
- `updateContacts({ email, phone })` — прямая смена допустима **только** для не-подтверждённых контактов. Для подтверждённых — `throw` (нужно использовать flow `PendingEmailChange`/`PendingPhoneChange` — agregate будет реализован позже)
- `removeEmail()`/`removePhone()` — нельзя удалить **подтверждённый** контакт, если **другой** контакт не подтверждён (пользователь не может "разлогиниться")
- `activate()` — нельзя если нет ни одного подтверждённого контакта

**События:**
- `EmailVerifiedEvent`, `PhoneVerifiedEvent` — при подтверждении
- `UserActivatedEvent` — при первом переходе из `pending_verification` в `active`
- `UserCreatedEvent`, `UserUpdatedEvent` — как раньше

### Конфигурация
- `APP_PORT=3001`, `APP_PATH_PREFIX=api/v1` (через `.env`)
- Все эндпоинты на `/api/v1/...`
- Префикс читается через `ConfigService`, применяется условно (`if (pathPrefix) app.setGlobalPrefix(pathPrefix)`)

### Экспериментальные модули
- В `src/modules/` есть `_dev` и `_test` — это **личные эксперименты пользователя** (TestModule, DevModule)
- Подключены в `app.module.ts`, работают на `/api/v1/test` и `/api/v1/dev`
- **НЕ удалять и не править без явной просьбы**

### Git
- Локальный репо в `nodejs-server/project`, ветка `main`
- Remote: `https://github.com/ivatutin/njs-server.git`
- **НЕ путать с родительским `C:/WORK/VIM/WORK`** — это другой репо

---

## Текущий прогресс

Реализация по пошаговому плану из 17 шагов (`~/.claude/plans/snoopy-roaming-karp.md`). Подплан по email/phone: `~/.claude/plans/synchronous-inventing-pudding.md`.

| # | Шаг | Статус |
|---|---|---|
| 1 | Hello World NestJS | ✅ |
| 2 | Структура каталогов + .gitignore | ✅ |
| 3 | Shared Domain (AggregateRoot, Entity, ValueObject, DomainEvent) | ✅ |
| 4 | Event Bus (interface + InMemoryEventBus) | ✅ |
| 5 | User Domain (entity, VOs, events, repository port) | ✅ |
| 6 | Config module + .env + zod валидация | ✅ |
| **7** | **Prisma + PostgreSQL — В ПРОЦЕССЕ** | ⏳ |
| 7.1 | Установка Prisma | ✅ |
| 7.2 | schema.prisma + переделка domain | ✅ |
| 7.3 | PrismaService | ⏭️ следующий |
| 7.4 | PrismaModule (@Global) | pending |
| 7.5 | Подключить в app.module.ts | pending |
| 7.6 | Поднять Postgres в Docker | pending |
| 7.7 | Создать PostgreSQL schema `"user"` | pending |
| 7.8 | Миграция с CHECK constraint | pending |
| 7.9 | Проверки (UNIQUE, CHECK, подключение) | pending |
| 8 | User Repository (Prisma adapter + mapper) | pending |
| 9 | User Use Cases (CRUD) | pending |
| 10 | User Controller + DTO + модуль | pending |
| 11 | Health endpoint (@nestjs/terminus) | pending |
| 12 | Structured logging (pino) | pending |
| 13 | Exception filter | pending |
| 14 | Docker (Dockerfile + compose) | pending |
| 15 | Auth module (Keycloak + guards + events) | pending |
| 16 | CI/CD (GitHub Actions) | pending |
| 17 | Unit тесты | pending |

---

## Команды разработки

```bash
# Запуск с hot-reload
npm run start:dev          # http://localhost:3001/api/v1

# Build (через SWC)
npm run build

# Prisma
npx prisma validate
npx prisma generate
npx prisma migrate dev --create-only --name <name>   # создать без применения
npx prisma migrate dev                               # применить

# PostgreSQL в Docker
docker run --name pg-dev \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app \
  -p 5432:5432 -d postgres:16-alpine

# Создать схему "user" (multiSchema требует существующей схемы)
docker exec pg-dev psql -U postgres -d app -c 'CREATE SCHEMA IF NOT EXISTS "user";'

# Git
git add . && git commit -m "..." && git push
```

---

## Best Practices разработки

### 1. Стратегия тестирования

| Слой | Тип теста | Что мокаем |
|---|---|---|
| `domain/` | Unit (Jest) | **ничего** — чистый TS |
| `application/` (use cases) | Unit с моками | порты: `UserRepository`, `EventBus`, `IdentityProviderPort` |
| `infrastructure/` (репозитории, адаптеры) | Integration | реальная БД через testcontainers, HTTP-моки для Keycloak |
| `interfaces/` (HTTP) | E2E (smoke) | полный стек, реальные http запросы |

**Целевое coverage:**
- domain: 90%+ (это ядро бизнес-логики)
- use cases: 80%+
- infrastructure: достаточно happy-path
- интерфейсы: ключевые сценарии

**Правила:**
- Не мокать классы, **мокать порты** (интерфейсы)
- Тесты на инварианты домена обязательны (например, `User must have email or phone`)
- Снапшот-тесты — **избегать** в backend

---

### 2. Naming conventions

**Файлы (kebab-case):**
- `user.entity.ts`, `email.vo.ts`, `user-id.vo.ts`
- `create-user.use-case.ts`, `create-user.command.ts`
- `user-created.event.ts`, `on-user-signed-in.handler.ts`
- `prisma-user.repository.ts`, `user.mapper.ts`
- `create-user.dto.ts`, `user-response.dto.ts`
- `identity-provider.port.ts`

**Суффиксы файлов:** `.entity.ts`, `.vo.ts`, `.event.ts`, `.use-case.ts`, `.command.ts`, `.query.ts`, `.dto.ts`, `.mapper.ts`, `.port.ts`, `.handler.ts`, `.repository.ts`, `.adapter.ts`, `.module.ts`, `.controller.ts`, `.guard.ts`, `.decorator.ts`, `.spec.ts`

**Классы (PascalCase, без избыточных суффиксов):**
- ✅ `User` (в `user.entity.ts`)
- ❌ `UserEntity`
- ✅ `Email` (в `email.vo.ts`)
- ❌ `EmailValueObject`
- ✅ `CreateUserUseCase`, `UserCreatedEvent`, `PrismaUserRepository`

**DI токены (SCREAMING_SNAKE_CASE Symbol):**
- `USER_REPOSITORY`, `EVENT_BUS`, `IDENTITY_PROVIDER`, `TOKEN_STORE`

**События** — `<context>.<action-past-tense>`:
- `user.created`, `user.updated`, `auth.user-signed-in`, `billing.invoice-paid`

**Папки (kebab-case):** `value-objects/`, `use-cases/`, `event-handlers/`

---

### 3. Обработка ошибок

**В domain — кастомные классы исключений:**
```ts
// src/modules/user/domain/errors/user-not-found.error.ts
export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User ${id} not found`);
    this.name = 'UserNotFoundError';
  }
}
```

**В infrastructure — ловим Prisma, мапим в domain:**
```ts
try {
  return await this.prisma.user.create({ data });
} catch (err) {
  if (err.code === 'P2002') throw new EmailAlreadyExistsError(...);
  if (err.code === 'P2010' && err.meta?.code === '23514') {
    throw new InvalidContactsError('User must have email or phone');
  }
  throw err;
}
```

**В interfaces (HTTP) — глобальный exception filter:**
- `UserNotFoundError` → `404`
- `EmailAlreadyExistsError`, `InvalidContactsError` → `400/409`
- неожиданные ошибки → `500`, логируем со стеком

**ЗАПРЕЩЕНО:**
- `throw new Error('...')` — только специфичные классы
- Логировать PII (email, phone, имена) в сообщениях ошибок
- Логировать секреты, токены, пароли
- В HTTP-ответах — внутренние детали (стек, имена таблиц)

---

### 4. Outbox pattern и идемпотентность

**Текущее состояние (упрощённо):** события публикуются прямо из `repository.save()` после `prisma.upsert()`. Если процесс упадёт между коммитом и публикацией — событие потеряно.

**Production-готовый вариант (TODO):**
1. Таблица `outbox` в БД, общая для всех модулей или по модулям
2. В транзакции с записью агрегата — INSERT в `outbox`
3. Отдельный воркер читает `outbox`, публикует в RabbitMQ, помечает как published
4. Доставка **at-least-once** → handlers обязаны быть идемпотентными

**Идемпотентность handlers:**
- В payload события всегда `eventId` (UUID)
- Handler проверяет в `processed_events` table — если уже обработано, return
- Use case с `commandId` — то же самое для команд (для retry от клиента)

**Когда внедрять:** при переходе с in-memory bus на RabbitMQ (Шаг после основного плана).

---

### 5. Транзакции и Unit of Work

**Правило:** одна use case = одна транзакция. Транзакция стартует в **infrastructure**, **домен не знает о транзакциях**.

**Паттерн с Prisma `$transaction`:**
```ts
// Use case
@Injectable()
export class TransferMoneyUseCase {
  constructor(@Inject(ACCOUNT_REPOSITORY) private repo: AccountRepository) {}

  async execute(cmd: TransferMoneyCommand) {
    await this.repo.runInTransaction(async (txRepo) => {
      const from = await txRepo.findById(cmd.from);
      const to = await txRepo.findById(cmd.to);
      from.withdraw(cmd.amount);
      to.deposit(cmd.amount);
      await txRepo.save(from);
      await txRepo.save(to);
    });
  }
}
```

**В порте:**
```ts
export interface AccountRepository {
  // ... обычные методы
  runInTransaction<T>(work: (txRepo: AccountRepository) => Promise<T>): Promise<T>;
}
```

**В Prisma adapter:**
```ts
async runInTransaction(work) {
  return this.prisma.$transaction(async (tx) => {
    const txRepo = new PrismaAccountRepository(tx, this.eventBus);
    return work(txRepo);
  });
}
```

**ЗАПРЕЩЕНО:**
- Передавать `PrismaClient` или `tx` в use case — это утечка инфраструктуры в application
- Открывать транзакцию в контроллере

---

### 6. API conventions

**Pagination:**
- Лента/feed → **cursor-based**: `GET /users?cursor=<id>&limit=20` → `{ items, nextCursor }`
- Админка → **offset-based**: `GET /admin/users?page=1&pageSize=50` → `{ items, total, page, pageSize }`
- Default `limit/pageSize`: 20, max: 100

**Versioning:**
- `/api/v1/...` — текущая версия (через `APP_PATH_PREFIX`)
- Ломающие изменения → `/api/v2/...`, **не править v1**
- Новые поля в response → можно в текущей версии (добавление обратно-совместимо)

**DTO discipline (КРИТИЧНО):**
- HTTP DTO **никогда не равен** domain entity
- Контроллер возвращает `UserResponseDto`, не `User`
- Mapping через явные `*Mapper` классы
- DTO для входа: validate через `class-validator` (`@IsEmail()`, `@IsString()` и т.д.)

**Тонкие контроллеры:**
```ts
@Post()
async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
  const user = await this.createUser.execute(new CreateUserCommand(dto.email, ...));
  return UserHttpMapper.toResponse(user);
}
// больше ничего — никакой бизнес-логики в контроллере
```

**HTTP коды:**
- `200` GET success
- `201` POST success (создано)
- `204` DELETE success (no content)
- `400` validation error
- `401` not authenticated
- `403` not authorized (есть токен, но нет прав)
- `404` not found
- `409` conflict (email already exists)
- `422` business rule violation (User must have email or phone)
- `500` internal error

**CQRS — когда применять:**
- Простые модули → use case = command или query, файлы рядом
- Сложные домены → разделять `commands/` и `queries/`, разные модели для чтения и записи. Для текущего проекта — пока не нужно.

---

### 7. Definition of Done (для каждого шага)

Шаг считается выполненным когда:

- ✅ **Код написан** — соответствует архитектурным правилам, path aliases корректные
- ✅ **`npm run build` проходит** — 0 ошибок TypeScript
- ✅ **`npm run lint` проходит** (когда добавим ESLint в Шаге 16)
- ✅ **Unit тесты написаны** — для нового domain/application кода
- ✅ **`npm run test` проходит** — все зелёные
- ✅ **Endpoint проверен** — через `curl` или e2e
- ✅ **Domain слой чист** — `grep -r "@nestjs\|prisma" src/modules/*/domain/` → нет совпадений
- ✅ **Коммит создан** с осмысленным message в Conventional Commits:
  - `feat:` новая фича
  - `fix:` баг
  - `refactor:` рефакторинг без изменения поведения
  - `chore:` инфра, конфиги, зависимости
  - `test:` тесты
  - `docs:` документация
  - Пример: `feat(user): add updateContacts use case with email/phone invariant`

**Только после выполнения всех пунктов** — переходить к следующему шагу.

---

## Стиль работы с пользователем

- **Язык:** русский (тексты, объяснения). Код, имена файлов, переменных — на английском.
- **Формат:** обучающий, пошаговый. Пользователь предпочитает делать сам, я проверяю и подсказываю.
- **Не генерировать большие блоки кода без запроса** — давать инструкции по одному шагу.
- **Перед правкой файла** — обязательно перечитывать (пользователь правит параллельно).
- **Объяснять зачем** нужны абстракции, когда спрашивает.
- **Build + endpoint check** после каждого шага.
- **Никогда не делать commit/push без явного запроса** пользователя.
