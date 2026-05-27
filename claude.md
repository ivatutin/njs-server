# claude.md

> Обзорный документ проекта **njs-server** для разработчиков и AI-ассистентов.
> Краткое введение в цели, архитектуру, структуру и процессы. Подробная документация — в [`docs/DEVELOPER_GUIDE.md`](./docs/DEVELOPER_GUIDE.md).

---

## 1. О проекте

**njs-server** — backend-приложение на NestJS, реализующее **управление пользователями** с делегированной аутентификацией через **Keycloak**. Проект используется как обучающий эталон production-практик: Modular Monolith, DDD, Hexagonal Architecture, defense-in-depth для бизнес-инвариантов.

### Основные функции

- Регистрация и жизненный цикл пользователя (создание → верификация контакта → активация → suspend/activate → удаление)
- Поддержка двух каналов идентификации: **email и/или phone** (E.164), оба опциональные, но обязателен хотя бы один
- Подтверждение контактов с автопереходом в `active`
- Аутентификация (sign-in/sign-out/refresh/validate) через Keycloak с blacklist токенов в Redis
- Доменные события (`UserCreated`, `EmailVerified`, `UserActivated`, …) на in-memory event bus, заменяемом на RabbitMQ без правок domain/application
- Документированный HTTP API (Swagger UI), structured JSON-логи (pino), health-чек

### Цели проекта

- Демонстрация production-готовой архитектуры backend на NestJS
- Чёткое разделение слоёв: domain не зависит от фреймворков
- Изолированные bounded contexts: модули общаются только через события
- Тестируемость: 90%+ coverage domain, моки портов, не классов

---

## 2. Технологический стек

| Категория | Технология | Версия |
|---|---|---|
| Runtime | Node.js | 20 LTS (alpine в Docker) |
| Framework | NestJS | 11 |
| Язык | TypeScript | 5.9.3 (SWC builder) |
| ORM | Prisma | 7.7 (multiSchema, новый клиент) |
| База данных | PostgreSQL | 16-alpine |
| Кэш / blacklist | Redis | 7-alpine (ioredis) |
| Identity Provider | Keycloak | 24 |
| Валидация | Zod | 4 (DTO + env) |
| Логирование | Pino + nestjs-pino | 10 |
| Тесты | Jest + ts-jest | 30 |
| CI/CD | GitHub Actions → GHCR | — |
| Package manager | npm | — |

---

## 3. Архитектура

### 3.1 Высокоуровневая схема

```
┌────────────────────────────────────────────────────────────┐
│                       interfaces/                          │
│        HTTP Controllers · DTO (Zod) · Mappers · Guards     │
└────────────────────────────┬───────────────────────────────┘
                             │ Commands / Queries
┌────────────────────────────▼───────────────────────────────┐
│                       application/                         │
│        Use Cases · Event Handlers · Ports (interfaces)     │
└──────────┬───────────────────────────────────┬─────────────┘
           │ depends on ports                  │
┌──────────▼──────────┐               ┌────────▼─────────────┐
│      domain/        │               │   infrastructure/    │
│   Entities, VOs,    │               │  Prisma repos,       │
│   Domain Events,    │               │  Keycloak adapter,   │
│   Domain Errors     │               │  Redis, EventBus     │
│   (no NestJS, no    │               │  (implements ports)  │
│    Prisma, no HTTP) │               │                      │
└─────────────────────┘               └──────────────────────┘
```

### 3.2 Принципы

- **Modular Monolith.** Один процесс, один деплой, но границы модулей строгие.
- **Bounded contexts изолированы.** `user/` и `auth/` не импортируют друг друга — обмен данными через **domain events**.
- **Hexagonal (Ports & Adapters).** Application зависит от интерфейсов (`USER_REPOSITORY`, `IDENTITY_PROVIDER`, `EVENT_BUS`), реализации заменяемы.
- **Domain чистый.** `grep -r "@nestjs\|prisma" src/modules/*/domain/` → пусто.
- **Defense in depth.** Инварианты (например, «email или phone обязателен») проверяются на 4 уровнях: HTTP DTO → entity → DB CHECK → repository error mapper.
- **PostgreSQL schemas.** Логическое разделение модулей в одной БД (схема `"user"` для модуля User).

Подробное обоснование решений — в [ADR](./docs/adr/).

---

## 4. Структура проекта

```
njs-server/
├── src/
│   ├── main.ts                 # bootstrap: pino, ZodValidationPipe, Swagger, global prefix
│   ├── app.module.ts           # корневой модуль
│   ├── app.controller.ts       # root endpoint
│   │
│   ├── config/                 # конфигурация и валидация env (Zod)
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   ├── keycloak.config.ts
│   │   └── env.validation.ts
│   │
│   ├── shared/                 # технический «kernel» — НЕ бизнес-логика
│   │   ├── domain/             # AggregateRoot, Entity, ValueObject, базовые ошибки
│   │   ├── application/        # UseCase interface, EventBus port
│   │   └── infrastructure/     # Prisma, Redis, EventBus impl, logger, health, exception filter
│   │
│   ├── modules/                # bounded contexts (feature-first)
│   │   ├── user/
│   │   │   ├── domain/
│   │   │   │   ├── entities/         # User aggregate
│   │   │   │   ├── value-objects/    # Email, Phone, UserId
│   │   │   │   ├── events/           # UserCreated, EmailVerified, UserActivated…
│   │   │   │   ├── errors/           # UserNotFoundError, InvalidContactsError…
│   │   │   │   └── repositories/     # UserRepository port (интерфейс)
│   │   │   ├── application/
│   │   │   │   ├── use-cases/        # create, update-contacts, verify-email, suspend, …
│   │   │   │   └── event-handlers/   # on-user-signed-in и т.п.
│   │   │   ├── infrastructure/       # PrismaUserRepository, mapper, error mapper
│   │   │   ├── interfaces/           # HTTP controller, Zod DTO, response mapper
│   │   │   └── user.module.ts
│   │   │
│   │   ├── auth/
│   │   │   ├── domain/
│   │   │   ├── application/use-cases # sign-in, sign-out, refresh-token, validate-token
│   │   │   ├── infrastructure/       # KeycloakAdapter, RedisTokenStore
│   │   │   ├── interfaces/http/      # AuthController, JwtAuthGuard, @Public, @CurrentUser
│   │   │   └── auth.module.ts
│   │   │
│   │   ├── _dev/               # личные dev-эксперименты (не трогать без запроса)
│   │   └── _test/              # личные test-эксперименты
│   │
│   └── generated/prisma/       # сгенерированный Prisma Client (gitignored)
│
├── prisma/
│   ├── schema.prisma           # модели; url хранится в prisma.config.ts (Prisma 7)
│   └── migrations/             # SQL-миграции
├── prisma.config.ts            # конфиг Prisma 7 (новое расположение)
│
├── docker/
│   ├── Dockerfile              # multi-stage build для NestJS
│   └── postgres-init.sql       # init: CREATE SCHEMA "user"
├── docker-compose.yml          # dev: postgres + redis + keycloak + app
├── docker-compose.prod.yml     # prod overrides
│
├── docs/
│   ├── DEVELOPER_GUIDE.md      # полная документация на русском (21 раздел)
│   └── adr/                    # Architecture Decision Records (0001…0007)
│
├── .github/workflows/
│   ├── pr.yml                  # PR check: install → lint → test → build
│   └── main.yml                # main: validation + Docker push в GHCR
│
├── .env.example                # шаблон переменных окружения
├── .claude/CLAUDE.md           # контекст для AI-ассистента (правила проекта)
├── README.md                   # короткий quick start (en)
└── claude.md                   # этот файл
```

---

## 5. Локальный запуск

### 5.1 Требования

- **Node.js 20 LTS**
- **Docker Desktop** (для Postgres, Redis, Keycloak)
- **npm** (поставляется с Node)

### 5.2 Шаги

```bash
# 1. Клонировать и установить зависимости
git clone https://github.com/ivatutin/njs-server.git
cd njs-server
npm install

# 2. Скопировать переменные окружения
cp .env.example .env
# Отредактировать KEYCLOAK_CLIENT_SECRET после настройки Keycloak

# 3. Поднять инфраструктуру
docker compose up -d postgres redis keycloak

# 4. Сгенерировать Prisma Client и применить миграции
npx prisma generate
npx prisma migrate dev

# 5. Запустить приложение с hot-reload
npm run start:dev
```

| Сервис | URL |
|---|---|
| API | `http://localhost:3001/api/v1` |
| Swagger UI | `http://localhost:3001/api/v1/docs` |
| Health | `http://localhost:3001/api/v1/health` |
| Keycloak | `http://localhost:8088` (admin/admin по умолчанию) |
| Postgres | `localhost:5432` (postgres/postgres) |
| Redis | `localhost:6379` |

**Первоначальная настройка Keycloak** (realm, client, secret) — разовая, выполняется через UI. См. [Developer Guide §16](./docs/DEVELOPER_GUIDE.md#16-локальная-разработка).

---

## 6. Примеры использования

### 6.1 Регистрация пользователя

```bash
curl -X POST http://localhost:3001/api/v1/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "firstName": "Alice",
    "lastName": "Smith"
  }'
```

Ответ:

```json
{
  "id": "8f...",
  "email": "alice@example.com",
  "status": "pending_verification",
  "emailVerifiedAt": null,
  "phoneVerifiedAt": null
}
```

### 6.2 Подтверждение email

```bash
curl -X POST http://localhost:3001/api/v1/users/8f.../verify-email \
  -H "Authorization: Bearer <admin-token>"
```

После первой верификации — статус автоматически становится `active`, эмитится `UserActivatedEvent`.

### 6.3 Sign-in через Keycloak

```bash
curl -X POST http://localhost:3001/api/v1/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{ "username": "alice@example.com", "password": "secret" }'
```

Ответ: `{ accessToken, refreshToken, expiresIn }`.

### 6.4 Use case изнутри (концептуально)

```ts
// src/modules/user/application/use-cases/create-user/create-user.use-case.ts
@Injectable()
export class CreateUserUseCase implements UseCase<CreateUserCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  async execute(cmd: CreateUserCommand): Promise<User> {
    const user = User.create({ /* …VO instantiation… */ });   // domain инвариант
    await this.users.save(user);                               // через порт
    await this.bus.publishAll(user.pullDomainEvents());        // UserCreatedEvent
    return user;
  }
}
```

Контроллер тонкий — только маппинг DTO ↔ command, без бизнес-логики.

---

## 7. Команды

### Разработка

| Команда | Описание |
|---|---|
| `npm run start:dev` | старт с hot-reload (SWC) |
| `npm run build` | production-сборка в `dist/` |
| `npm start` | запуск из `dist/` |

### Качество

| Команда | Описание |
|---|---|
| `npm run lint` | ESLint |
| `npm run lint:fix` | автофикс |
| `npm run format` | Prettier |
| `npm test` | unit-тесты (Jest) |
| `npm run test:cov` | тесты с отчётом покрытия |

### База данных

| Команда | Описание |
|---|---|
| `npx prisma generate` | регенерация TS-клиента |
| `npx prisma migrate dev --create-only --name <name>` | создать миграцию без применения |
| `npx prisma migrate dev` | применить миграцию (dev) |
| `npx prisma migrate deploy` | применить миграцию (prod) |
| `npx prisma studio` | веб-GUI для просмотра данных |

### Docker

| Команда | Описание |
|---|---|
| `docker compose up -d` | полный стек |
| `docker compose down` | остановить |
| `docker compose down -v` | + удалить volumes |
| `docker compose exec app npx prisma migrate deploy` | миграции внутри контейнера |

---

## 8. Тестирование

| Слой | Тип теста | Что мокаем |
|---|---|---|
| `domain/` | Unit (Jest) | ничего — чистый TS |
| `application/` (use cases) | Unit с моками | порты: `UserRepository`, `EventBus`, `IdentityProviderPort` |
| `infrastructure/` | Integration | реальная БД (testcontainers), HTTP-моки для Keycloak |
| `interfaces/` (HTTP) | E2E (smoke) | полный стек, реальные HTTP-запросы |

**Целевое coverage:** domain 90%+, use cases 80%+, infrastructure — happy path, interfaces — ключевые сценарии.

**Правила:**
- Мокаем **порты (интерфейсы)**, а не классы.
- Тесты на доменные инварианты обязательны (например, `User must have email or phone`).
- Снапшот-тесты в backend — избегаем.

Запуск:

```bash
npm test                  # все unit-тесты
npm run test:cov          # с отчётом покрытия
```

---

## 9. CI/CD

| Workflow | Триггер | Шаги |
|---|---|---|
| [`.github/workflows/pr.yml`](.github/workflows/pr.yml) | pull request | install → lint → test → build |
| [`.github/workflows/main.yml`](.github/workflows/main.yml) | push в `main` | validation + Docker image → `ghcr.io/ivatutin/njs-server:latest` |

**Особенности:**
- Кэширование `node_modules` через `actions/setup-node` + `cache: npm`.
- Fail fast при ошибках любого шага.
- Раздельные workflow для PR и main.

**Registry:** [packages on GitHub](https://github.com/ivatutin?tab=packages).

---

## 10. Деплой

Production-сборка — это образ из `docker/Dockerfile` (multi-stage), запускаемый через `docker-compose.prod.yml` либо в любой среде с Docker.

Минимальный production-flow:

```bash
# Pull нового образа
docker pull ghcr.io/ivatutin/njs-server:latest

# Применить миграции внутри контейнера
docker compose -f docker-compose.prod.yml run --rm app npx prisma migrate deploy

# Перезапустить
docker compose -f docker-compose.prod.yml up -d app
```

Все секреты — через `.env` (никогда не коммитить).

---

## 11. Переменные окружения

Все переменные валидируются Zod-схемой в [`src/config/env.validation.ts`](src/config/env.validation.ts). Приложение **не стартует**, если набор/типы невалидны.

| Категория | Переменные |
|---|---|
| App | `NODE_ENV`, `APP_PORT`, `APP_PATH_PREFIX`, `LOG_LEVEL` |
| Database | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| Keycloak (admin) | `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` |
| Keycloak (app) | `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` |
| Throttler | `THROTTLE_TTL`, `THROTTLE_LIMIT` |

Полный пример — [`.env.example`](./.env.example).

---

## 12. Ключевые конвенции

### Naming

- **Файлы:** kebab-case с суффиксом — `user.entity.ts`, `email.vo.ts`, `create-user.use-case.ts`, `user-created.event.ts`, `prisma-user.repository.ts`.
- **Классы:** PascalCase без избыточных суффиксов — `User` (не `UserEntity`), `Email` (не `EmailValueObject`).
- **DI токены:** `Symbol` в SCREAMING_SNAKE_CASE — `USER_REPOSITORY`, `EVENT_BUS`, `IDENTITY_PROVIDER`.
- **События:** `<context>.<action-past-tense>` — `user.created`, `auth.user-signed-in`.

### Обработка ошибок

- В `domain/` — кастомные классы ошибок (`UserNotFoundError`, `InvalidContactsError`).
- В `infrastructure/` — ловим Prisma и мапим в доменные ошибки.
- В `interfaces/` — глобальный `AllExceptionsFilter` мапит на HTTP-коды.
- **Запрещено:** `throw new Error('…')`, логировать PII / секреты, отдавать стек/имена таблиц в HTTP-ответах.

### HTTP

- DTO ≠ entity. Всегда явные `*Mapper`-классы.
- Pagination: cursor-based для ленты, offset-based для админки. Default `limit=20`, max `100`.
- Versioning через path prefix (`/api/v1`).
- Коды: `200/201/204/400/401/403/404/409/422/500`.

### Definition of Done

Шаг готов, когда: код проходит build/lint, написаны unit-тесты, тесты зелёные, endpoint проверен, домен чист от фреймворков, коммит в формате Conventional Commits.

Полный набор правил — [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) и [Developer Guide §17–§20](./docs/DEVELOPER_GUIDE.md).

---

## 13. Полезные ссылки

| Ресурс | Где |
|---|---|
| Developer Guide (RU, 21 раздел) | [`docs/DEVELOPER_GUIDE.md`](./docs/DEVELOPER_GUIDE.md) |
| Architecture Decision Records | [`docs/adr/`](./docs/adr/) |
| Контекст для AI-ассистента | [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) |
| README (en, quick start) | [`README.md`](./README.md) |
| Swagger UI | `http://localhost:3001/api/v1/docs` (когда приложение запущено) |
| NestJS docs | https://docs.nestjs.com |
| Prisma 7 docs | https://www.prisma.io/docs |
| Keycloak 24 docs | https://www.keycloak.org/documentation |
| Zod docs | https://zod.dev |
| Conventional Commits | https://www.conventionalcommits.org |

---

## 14. Что НЕ делать (критично)

- ❌ Прямые импорты между модулями (`user/` ⟷ `auth/`) — только через события.
- ❌ Импорт NestJS / Prisma в `domain/`.
- ❌ Бизнес-логика в контроллерах.
- ❌ Передача `PrismaClient` / транзакции в use case.
- ❌ Cross-module доступ к таблицам других модулей.
- ❌ Хардкод секретов, логирование PII.
- ❌ Kubernetes, микросервисы, оверинжиниринг.
- ❌ Удаление модулей `_dev/` и `_test/` без явного запроса — это рабочие площадки владельца репозитория.

---

*Документ предназначен для онбординга разработчиков и работы AI-ассистентов с кодовой базой. При расхождениях с реальным состоянием кода — приоритет у кода и [`.claude/CLAUDE.md`](./.claude/CLAUDE.md).*
