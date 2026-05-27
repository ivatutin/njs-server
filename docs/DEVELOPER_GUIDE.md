# Руководство для разработчика

Документ описывает архитектуру, принципы разработки и конвенции этого проекта. Цель — чтобы новый разработчик мог быстро понять «как тут всё устроено» и **почему так**, а не только «что куда положить».

---

## Оглавление

1. [Что это за проект](#1-что-это-за-проект)
2. [Стек технологий](#2-стек-технологий)
3. [Архитектура: Modular Monolith + DDD + Hexagonal](#3-архитектура)
4. [Структура проекта](#4-структура-проекта)
5. [Слои приложения](#5-слои-приложения)
6. [Bounded contexts](#6-bounded-contexts)
7. [Доменная модель User](#7-доменная-модель-user)
8. [Аутентификация (Keycloak)](#8-аутентификация-keycloak)
9. [Межмодульное взаимодействие](#9-межмодульное-взаимодействие)
10. [Обработка ошибок](#10-обработка-ошибок)
11. [Конвенции и naming](#11-конвенции-и-naming)
12. [Конфигурация и окружение](#12-конфигурация-и-окружение)
13. [Логирование](#13-логирование)
14. [База данных и миграции](#14-база-данных-и-миграции)
15. [Тестирование](#15-тестирование)
16. [Локальная разработка](#16-локальная-разработка)
17. [Docker](#17-docker)
18. [CI/CD](#18-cicd)
19. [Definition of Done](#19-definition-of-done)
20. [Что НЕ делать (критично)](#20-что-не-делать)
21. [Roadmap и техдолг](#21-roadmap)

---

## 1. Что это за проект

**Scalable backend-приложение** — серверная часть бизнес-приложения с пользователями, аутентификацией через внешний identity provider, готовая к продакшен-эксплуатации.

Проект построен как **обучающий эталон**: каждое решение принято осознанно, объяснимо и соответствует индустриальным практикам для проектов среднего и крупного размера.

**Ключевые качества:**
- Бизнес-логика не зависит от фреймворка — её можно вынести в любой runtime
- Модули изолированы и могут разрабатываться независимыми командами
- Тесты пишутся быстро благодаря чистым интерфейсам (портам)
- Инфраструктуру (Postgres → MySQL, Keycloak → Auth0) можно заменить без переписывания бизнес-кода
- Полная инфраструктура поднимается одной командой (Docker Compose)
- Автоматизированные проверки на каждом PR

---

## 2. Стек технологий

| Компонент | Версия | Назначение |
|---|---|---|
| **Node.js** | 20 LTS | Runtime |
| **NestJS** | 11 | HTTP-фреймворк, DI-контейнер |
| **TypeScript** | 5.9.3 | Язык (не TS 6.x — он сломал bare `baseUrl`) |
| **SWC** | 1.15+ | Компилятор (в `nest-cli.json`, заменяет `tsc` для скорости + watch) |
| **PostgreSQL** | 16 | Основное хранилище |
| **Prisma** | 7.7 | ORM/миграции |
| **Redis** | 7 | Кэш, blacklist токенов |
| **Keycloak** | 24 | Identity Provider (внешний) |
| **Pino** | 10 | Структурированное логирование (JSON) |
| **Zod** | 4 | Валидация env и DTO |
| **Jest** | 30 | Unit-тесты |
| **Docker Compose** | v2 | Локальная и dev/prod инфраструктура |
| **GitHub Actions** | — | CI/CD |
| **ESLint 8 + Prettier 3** | — | Линтинг и форматирование |

### Почему именно эти инструменты

- **NestJS** — зрелый DI, модули, guards, pipes. Хорошо ложится на DDD/Hexagonal при правильном использовании
- **Prisma** — не протекает в domain (можно держать в чистоте). Schema-first, миграции из коробки. Альтернатива TypeORM плохо подходит, потому что `@Entity` на доменной модели = утечка инфраструктуры
- **SWC** вместо `tsc` — даёт сборку в 5-10 раз быстрее, корректно работает с `nest start --watch`. Type-check всё равно делает `tsc` под капотом nest-cli
- **Zod** вместо `class-validator` — единый источник правды (схема ⇄ типы автоматически), кросс-полевая валидация через `.refine()` без боли, та же библиотека что для env
- **Pino** — самый быстрый Node.js logger, JSON-формат, удобно для систем агрегации логов
- **Keycloak** — open-source IdP с богатым функционалом (realms, clients, federated identity). Хорош для on-premise

---

## 3. Архитектура

### Стиль: Modular Monolith

**Один процесс, несколько изолированных модулей.** Каждый модуль — самостоятельная единица с собственной доменной моделью.

**Почему монолит, а не микросервисы:**
- Микросервисы оправданы только при реальных проблемах со скейлингом, командой или независимым релиз-циклом
- Монолит проще разворачивать, отлаживать, тестировать
- Если когда-то понадобится разделить — bounded contexts делают это относительно простым

### Domain-Driven Design (DDD)

Бизнес-логика моделируется как **доменные сущности** с **инвариантами**. Сущность гарантирует, что её состояние всегда валидно — иначе бросает исключение.

Например, `User`:
- **Инвариант:** хотя бы один из `email` или `phone` должен быть заполнен
- **Состояния:** `pending_verification` → `active` → `suspended` → `active` / `deleted`
- Любая попытка нарушить инвариант → доменное исключение

### Hexagonal Architecture (Ports & Adapters)

**Принцип:** домен в центре, инфраструктура снаружи. Зависимости направлены **внутрь, к домену**.

```
                ┌─────────────────────────────────────┐
                │ Interfaces (HTTP controllers, DTOs) │
                ├─────────────────────────────────────┤
                │ Application (use cases)             │
                │  ↓ uses                             │
                ├─────────────────────────────────────┤
                │ Domain (entities, VOs, events,      │
                │          ports — interfaces)        │
                ├─────────────────────────────────────┤
                │ Infrastructure (Prisma, Keycloak,   │
                │   Redis — реализации портов)        │
                └─────────────────────────────────────┘
```

**Ключевая идея:**
- Domain определяет **port** — интерфейс «мне нужен репозиторий, который умеет findById/save/delete»
- Infrastructure поставляет **adapter** — конкретная реализация этого интерфейса через Prisma
- Application (use cases) зависят от **port**, не от adapter

Это даёт:
- **Замену реализации** без правок в use case (Prisma → MongoDB, Keycloak → Auth0)
- **Тестируемость** — use case можно покрыть unit-тестом с моком порта, без реальной БД
- **Чистоту домена** — он не знает что данные хранятся в SQL и говорят через HTTP

### Feature-first структура

Деление **по бизнес-доменам**, не по техническим слоям:

```
src/
├── modules/
│   ├── user/        ← всё про User в одном месте
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── interfaces/
│   └── auth/        ← всё про Auth
│       └── ...
└── shared/          ← technical kernel, общее для всех модулей
```

Альтернатива (layer-first) — `controllers/`, `services/`, `entities/` — ведёт к тому, что любая фича размазана по всему проекту. У нас наоборот: открыл `modules/user/` — увидел всё про пользователей.

---

## 4. Структура проекта

```
project/
├── prisma/
│   ├── schema.prisma                  # описание БД (multiSchema)
│   └── migrations/                    # автогенерируемые SQL-миграции
├── src/
│   ├── main.ts                        # entry: bootstrap NestJS, ZodValidationPipe, pino, prefix
│   ├── app.module.ts                  # корневой модуль
│   ├── app.controller.ts              # GET / → Hello World (public)
│   │
│   ├── config/                        # @nestjs/config с Zod-валидацией env
│   │   ├── env.validation.ts          # схема всех env-переменных
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   └── keycloak.config.ts
│   │
│   ├── shared/                        # technical kernel (НЕ бизнес-логика!)
│   │   ├── domain/
│   │   │   ├── aggregate-root.ts      # базовый класс aggregate root
│   │   │   ├── entity.ts              # базовый Entity<TId>
│   │   │   ├── value-object.ts        # базовый ValueObject<T>
│   │   │   ├── domain-event.ts        # интерфейс события
│   │   │   └── errors/                # базовые ошибки → HTTP коды
│   │   │       ├── domain.error.ts          # abstract
│   │   │       ├── rule-violation.error.ts  # → 422
│   │   │       ├── entity-not-found.error.ts # → 404
│   │   │       ├── conflict.error.ts        # → 409
│   │   │       ├── unauthorized.error.ts    # → 401
│   │   │       └── forbidden.error.ts       # → 403
│   │   ├── application/
│   │   │   ├── use-case.interface.ts        # UseCase<TCmd, TResult>
│   │   │   └── event-bus.interface.ts       # PORT для event bus
│   │   └── infrastructure/
│   │       ├── prisma/                # @Global PrismaService
│   │       ├── redis/                 # @Global Redis client (ioredis)
│   │       ├── event-bus/             # InMemoryEventBus (заменяемый)
│   │       ├── logger/                # nestjs-pino setup
│   │       ├── health/                # /health endpoint (terminus)
│   │       └── filters/               # AllExceptionsFilter (global)
│   │
│   ├── modules/
│   │   ├── user/
│   │   │   ├── domain/
│   │   │   │   ├── entities/user.entity.ts
│   │   │   │   ├── value-objects/    # UserId, Email, Phone, UserStatus
│   │   │   │   ├── events/           # UserCreated, EmailVerified, ...
│   │   │   │   ├── errors/           # UserNotFound, EmailAlreadyExists, ...
│   │   │   │   └── repositories/user.repository.ts  # PORT
│   │   │   ├── application/
│   │   │   │   ├── use-cases/        # 9 use cases (по папке на каждый)
│   │   │   │   └── event-handlers/
│   │   │   │       └── on-user-signed-in.handler.ts
│   │   │   ├── infrastructure/
│   │   │   │   └── persistence/      # Prisma adapter + mapper + error helper
│   │   │   ├── interfaces/
│   │   │   │   └── http/             # controller, DTOs (Zod), mapper
│   │   │   └── user.module.ts
│   │   │
│   │   └── auth/
│   │       ├── domain/
│   │       │   ├── ports/            # IdentityProviderPort, TokenStorePort
│   │       │   ├── events/           # UserSignedInEvent
│   │       │   └── errors/           # InvalidCredentials, InvalidToken
│   │       ├── application/
│   │       │   └── use-cases/        # SignIn, Refresh, SignOut, ValidateToken
│   │       ├── infrastructure/
│   │       │   ├── keycloak/         # HTTP client + JWT verifier + adapter
│   │       │   └── redis/            # RedisTokenStore (blacklist)
│   │       ├── interfaces/
│   │       │   └── http/             # controller, guards, decorators
│   │       └── auth.module.ts
│   │
│   └── generated/
│       └── prisma/                   # сгенерированный Prisma client (gitignored)
│
├── test/                              # unit-тесты (jest)
│   ├── domain/
│   └── application/
│
├── docker/
│   ├── Dockerfile                     # multi-stage: deps → build → runner
│   └── postgres-init.sql              # создание схем при первом старте Postgres
│
├── .github/workflows/
│   ├── pr.yml                         # на pull_request
│   └── main.yml                       # на push в main + Docker push
│
├── .claude/CLAUDE.md                  # инструкции для AI-ассистента (контекст)
├── docker-compose.yml                 # dev (полная инфра)
├── docker-compose.prod.yml            # prod override
├── .env.example                       # шаблон переменных окружения
├── .eslintrc.cjs
├── .prettierrc
├── prisma.config.ts                   # connection string для Prisma 7
├── package.json
└── tsconfig.json
```

---

## 5. Слои приложения

Каждый бизнес-модуль содержит **4 слоя**. Стрелки зависимостей — только вниз:

```
interfaces  ──→ application  ──→ domain
                   │
                   └────→ infrastructure ──→ domain
```

### Domain — ядро бизнес-логики

**Что внутри:**
- **Entities** (агрегаты) — `User`. Инкапсулируют состояние и инварианты
- **Value Objects** — `Email`, `Phone`, `UserId`, `UserStatus`. Immutable, валидируются при создании
- **Domain Events** — `UserCreatedEvent`, `EmailVerifiedEvent`, `UserSignedInEvent`. Эмитятся агрегатами при значимых изменениях
- **Ports** (интерфейсы) — `UserRepository`, `IdentityProviderPort`. Контракт для зависимостей от внешнего мира
- **Domain Errors** — `UserNotFoundError`, `InvalidContactsError`. Бизнес-правила бросают типизированные исключения

**Правила:**
- **НИКАКИХ** импортов из NestJS, Prisma, HTTP-фреймворков
- **НИКАКИХ** декораторов вроде `@Entity()`, `@Column()`
- Только чистый TypeScript
- Никаких импортов из других модулей (`auth/domain/` не знает про `user/domain/`)

**Проверка чистоты:**
```bash
grep -r "@nestjs\|prisma" src/modules/*/domain/
# должно быть пусто
```

### Application — use cases (сценарии)

**Что внутри:**
- **Use cases** — `CreateUserUseCase`, `SignInUseCase`. Один сценарий = один класс с методом `execute()`
- **Commands** — DTO для входа в use case (`CreateUserCommand`)
- **Event handlers** — `OnUserSignedInHandler`. Слушают доменные события и оркеструют реакции

**Правила:**
- Use case зависит **только от портов** через DI: `@Inject(USER_REPOSITORY) private userRepo: UserRepository`
- Никогда `@Inject(PrismaUserRepository)` — это утечка инфраструктуры
- Только `@Injectable()` из NestJS (без других декораторов)
- Возвращает **domain entity** или примитив, **не HTTP DTO** — маппинг в DTO ответственность контроллера

**Пример:**
```ts
@Injectable()
export class CreateUserUseCase implements UseCase<CreateUserCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
  ) {}

  async execute(cmd: CreateUserCommand): Promise<User> {
    // pre-check уникальности (UX)
    if (cmd.email) {
      const existing = await this.userRepo.findByEmail(Email.create(cmd.email));
      if (existing) throw new EmailAlreadyExistsError();
    }
    // создание + сохранение
    const user = User.create({...});
    await this.userRepo.save(user);
    return user;
  }
}
```

### Infrastructure — реализации портов и адаптеры внешних систем

**Что внутри:**
- **Prisma repository** — `PrismaUserRepository implements UserRepository`. Маппинг доменной сущности на Prisma row через `UserMapper`
- **External adapters** — `KeycloakAdapter implements IdentityProviderPort`, `RedisTokenStore implements TokenStorePort`
- **HTTP clients** — обёртки над axios для внешних API (`KeycloakHttpClient`)
- **Error mapping** — `prisma-error.helper.ts` переводит Prisma ошибки в доменные

**Правила:**
- Реализует **порт** из `domain/`
- Может зависеть от технологий (Prisma, axios, ioredis)
- **Не должен** знать про HTTP-слой
- Маппинг ошибок: ловим инфраструктурные → бросаем доменные

### Interfaces — HTTP/REST слой

**Что внутри:**
- **Controllers** — тонкие, только трансляция HTTP → use case
- **DTOs** — input через Zod, output как plain class
- **Mappers** — `UserHttpMapper.toResponse(user)` — domain entity → response DTO
- **Guards** — `JwtAuthGuard`, `RolesGuard`
- **Decorators** — `@Public()`, `@Roles()`, `@CurrentUser()`

**Правила:**
- В контроллере **никакой бизнес-логики**, только вызов use case
- HTTP DTO ≠ domain entity, **всегда** через mapper
- Валидация входа — через Zod schemas (`createZodDto`)

**Пример тонкого контроллера:**
```ts
@Post()
@HttpCode(201)
async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
  const user = await this.createUser.execute(
    new CreateUserCommand(dto.keycloakId, dto.email ?? null, ...),
  );
  return UserHttpMapper.toResponse(user);
}
```

---

## 6. Bounded contexts

В проекте сейчас **два** ограниченных контекста:

### User (управление пользователями)

- **Что хранит:** профиль пользователя (`firstName`, `lastName`), контакты (`email`, `phone`), статус, роли, метаданные
- **Что НЕ хранит:** пароли, токены, сессии (это в Keycloak)
- **Изоляция:** `UserModule` экспортирует **только** `ValidateTokenUseCase`? Нет — экспортирует **пустоту**. Другие модули общаются с ним только через события

### Auth (аутентификация)

- **Что хранит:** ничего постоянного. Refresh tokens — в Keycloak, blacklist access tokens — в Redis (с TTL)
- **Адаптер:** `KeycloakAdapter` инкапсулирует ВСЁ про Keycloak. Ни один другой модуль не знает про OpenID Connect, OAuth2, JWT verification — это implementation detail Auth
- **Изоляция:** `AuthModule` экспортирует **только** `ValidateTokenUseCase` (нужно для глобального `JwtAuthGuard`, который физически живёт в Auth и реализует контракт `CanActivate`)

### Возможные будущие контексты

- **Billing** — счета, подписки, платежи
- **Notification** — email/SMS рассылки. Будет слушать `EmailVerifiedEvent`, `UserCreatedEvent`
- **Audit** — лог действий пользователей

---

## 7. Доменная модель User

### Жизненный цикл

```
                  User.create()
                       │
                       ▼
           ┌───────────────────────┐
           │ pending_verification  │
           └───────────────────────┘
                       │
            verifyEmail() / verifyPhone()
                       │
                       ▼
           ┌───────────────────────┐
           │       active          │◀────activate()────┐
           └───────────────────────┘                   │
                       │                               │
                  suspend()                            │
                       │                               │
                       ▼                               │
           ┌───────────────────────┐                   │
           │     suspended         │───────────────────┘
           └───────────────────────┘
```

### Поля и инварианты

| Поле | Тип | NULL | Уникален | Назначение |
|---|---|---|---|---|
| `id` | UUID | ❌ | ✅ PK | Идентификатор |
| `email` | string | ✅ | ✅ если не NULL | Email |
| `phone` | string (E.164) | ✅ | ✅ если не NULL | Телефон в формате `+79991234567` |
| `email_verified_at` | timestamp | ✅ | ❌ | NULL = не подтверждён |
| `phone_verified_at` | timestamp | ✅ | ❌ | NULL = не подтверждён |
| `keycloak_id` | string | ❌ | ✅ | Связь с пользователем Keycloak |
| `first_name` / `last_name` | string | ✅ | ❌ | Профиль |
| `roles` | text[] | ❌ | ❌ | Роли (синхронизируются из Keycloak) |
| `metadata` | jsonb | ✅ | ❌ | Произвольные доп. данные |
| `status` | string | ❌ | ❌ | `pending_verification` / `active` / `suspended` / `deleted` |
| `created_at` / `updated_at` | timestamp | ❌ | ❌ | Автоматические |

### Ключевые инварианты

1. **Хотя бы один контакт.** `email IS NOT NULL OR phone IS NOT NULL` — нужно куда отправлять код для верификации
2. **Verified без контакта невозможен.** Нельзя проставить `email_verified_at` если `email = NULL`
3. **`status = 'active'` требует хотя бы один verified.** Иначе как мы подтвердили личность?
4. **Невозможно сменить verified контакт напрямую.** Нужно отдельный flow (`PendingEmailChange` — TODO)
5. **Невозможно удалить verified контакт, если другой не verified.** Иначе пользователь себя «разлогинит»

### Defense in depth — 4 уровня защиты инварианта 1

1. **HTTP DTO:** Zod `.refine()` запрещает запрос без email и без phone (400 на границе)
2. **Domain entity:** `User.create()` бросает `InvalidContactsError`
3. **БД CHECK constraint:** `users_email_or_phone_required` — Postgres откажет в INSERT
4. **Repository:** маппинг Prisma error `P2010/23514` → `InvalidContactsError`

Битая запись **физически не может появиться** в БД, даже если кто-то обойдёт домен.

### Методы агрегата

| Метод | Что делает | События |
|---|---|---|
| `User.create(props)` | Фабрика, status=pending | `UserCreatedEvent` |
| `verifyEmail()` | timestamp + auto-activate если pending. Идемпотентен. | `EmailVerifiedEvent` + опционально `UserActivatedEvent` |
| `verifyPhone()` | Аналогично | `PhoneVerifiedEvent` + опционально `UserActivatedEvent` |
| `updateProfile({firstName, lastName})` | Смена имени | `UserUpdatedEvent` |
| `updateContacts({email, phone})` | Только для не-verified! | `UserUpdatedEvent` |
| `removeEmail()` / `removePhone()` | С проверкой «не лочим пользователя» | `UserUpdatedEvent` |
| `suspend()` | active → suspended | `UserUpdatedEvent` |
| `activate()` | требует verified контакт | `UserUpdatedEvent` |
| `updateRoles(roles)` | Замена ролей | `UserUpdatedEvent` |

---

## 8. Аутентификация (Keycloak)

### Поток sign-in

```
Client                  AuthController        SignInUseCase        Keycloak       EventBus    OnUserSignedInHandler   UserRepository
   │ POST /auth/sign-in       │                    │                  │              │                │                     │
   ├────────────────────────▶│                     │                  │              │                │                     │
   │                         │ execute(cmd)        │                  │              │                │                     │
   │                         ├──────────────────▶ │ signIn(email,pwd) │              │                │                     │
   │                         │                    ├──────────────────▶│              │                │                     │
   │                         │                    │ TokenPair         │              │                │                     │
   │                         │                    │◀──────────────────┤              │                │                     │
   │                         │                    │ verifyAccessToken │              │                │                     │
   │                         │                    ├──────────────────▶│              │                │                     │
   │                         │                    │ TokenClaims       │              │                │                     │
   │                         │                    │◀──────────────────┤              │                │                     │
   │                         │                    │ publish(UserSignedInEvent)        │                │                     │
   │                         │                    ├──────────────────────────────────▶│                │                     │
   │                         │                    │                   │              │  handle(evt)   │                     │
   │                         │                    │                   │              ├───────────────▶│ findByKeycloakId    │
   │                         │                    │                   │              │                ├────────────────────▶│
   │                         │                    │                   │              │                │ save(User)          │
   │                         │                    │                   │              │                ├────────────────────▶│
   │                         │ TokenPair          │                   │              │                │                     │
   │ 200 + tokens            │◀──────────────────┤                   │              │                │                     │
   │◀────────────────────────┤                    │                   │              │                │                     │
```

### Что хранит Keycloak

- Логин/пароль пользователя
- Realms, clients, roles
- Refresh tokens (можно revoke)
- Email verification, password reset flows

### Что хранит наш Redis

- **Blacklist access tokens** после sign-out с TTL = remaining JWT lifetime
- В будущем — кэш сессий, throttling, queue

### Защита endpoints

**Security-by-default:** все endpoints требуют валидный Bearer token. Публичные явно помечаются `@Public()`.

```ts
@Controller('users')
export class UserController {
  @Get(':id')                    // защищён
  async findOne(...) {...}
}

@Controller()
export class AppController {
  @Public()                      // открыт
  @Get()
  hello() { return 'Hello'; }
}

@Controller('admin')
@Roles('admin')                  // требует роль admin (после JWT)
export class AdminController {...}
```

### Глобальные guards (порядок важен)

1. `JwtAuthGuard`:
   - Если `@Public()` → пропуск
   - Иначе: extract Bearer → `ValidateTokenUseCase.execute(token)`
   - `ValidateTokenUseCase` сначала проверяет blacklist в Redis, потом JWT signature через JWKS Keycloak
   - При успехе → claims в `request.user`
2. `RolesGuard`:
   - Читает `@Roles(...)` метаданные
   - Сравнивает с `request.user.roles`
   - При несовпадении → `ForbiddenError` → 403

---

## 9. Межмодульное взаимодействие

### Правила

1. **Никаких прямых импортов** между `modules/user/` и `modules/auth/`
2. **Никаких экспортов use cases** между модулями (кроме исключений типа `ValidateTokenUseCase` для guard)
3. Общение **только через domain events** на in-memory event bus

### Event bus

Интерфейс в `shared/application/event-bus.interface.ts`:
```ts
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
  subscribe(eventName: string, handler: EventHandler): void;
}
```

Реализация: `InMemoryEventBus` (см. `shared/infrastructure/event-bus/`). Подписка sequential, ошибка одного handler не убивает остальных.

**Замена на RabbitMQ** в будущем — нужно только:
1. Написать `RabbitMqEventBus implements EventBus`
2. Поменять `useClass` в `EventBusModule`
3. Ноль изменений в domain и application

### Пример: межмодульная координация

**Сценарий:** при первом sign-in пользователь должен появиться в нашей таблице `user.users` со статусом active.

```ts
// Auth module
class SignInUseCase {
  async execute(cmd: SignInCommand) {
    const tokens = await this.idp.signIn(...);
    const claims = await this.idp.verifyAccessToken(tokens.accessToken);
    await this.eventBus.publish(new UserSignedInEvent({...}));
    return tokens;
  }
}
```

```ts
// User module — слушает событие
class UserModule implements OnModuleInit {
  onModuleInit() {
    this.eventBus.subscribe('auth.user-signed-in', (e) => this.handler.handle(e));
  }
}

class OnUserSignedInHandler {
  async handle(event) {
    const existing = await this.userRepo.findByKeycloakId(event.payload.keycloakId);
    if (!existing) {
      const user = User.create({...});
      user.verifyEmail();
      await this.userRepo.save(user);
    } else {
      // sync roles если изменились
    }
  }
}
```

**Auth ничего не знает про User.** User ничего не знает про Keycloak. Контракт — только название события (строка) и его payload.

### Шейтерый kernel для событий (TODO)

Сейчас тип `UserSignedInPayload` дублируется (в `auth/domain/events/` и в `user/application/event-handlers/` локально). Можно вынести в `shared/events/contracts/` — пока избыточно для одного события.

---

## 10. Обработка ошибок

### Иерархия

```
DomainError (abstract)
├── EntityNotFoundError       → 404
├── ConflictError              → 409
├── RuleViolationError         → 422
├── UnauthorizedError          → 401
└── ForbiddenError             → 403
```

Конкретные классы в модулях наследуют от базовых:
```
UserNotFoundError extends EntityNotFoundError
EmailAlreadyExistsError extends ConflictError
InvalidContactsError extends RuleViolationError
InvalidCredentialsError extends UnauthorizedError
```

### AllExceptionsFilter (global)

`shared/infrastructure/filters/all-exceptions.filter.ts` — единая точка обработки.

| Что прилетело | HTTP код | Body |
|---|---|---|
| `EntityNotFoundError` | 404 | `{error, message, ...}` |
| `ConflictError` | 409 | `{error, message, ...}` |
| `RuleViolationError` | 422 | `{error, message, ...}` |
| `UnauthorizedError` | 401 | `{error, message, ...}` |
| `ForbiddenError` | 403 | `{error, message, ...}` |
| NestJS `HttpException` (Zod, ParseUUID) | оригинальный код | оригинальный body + `details` |
| Любое другое | 500 | `{message: "Internal server error"}` (без раскрытия деталей) |

**Логирование:** 4xx → `warn`, 5xx → `error` (со стеком).

### Правила

- ❌ `throw new Error('message')` в domain/application
- ✅ Кастомный класс наследник `DomainError`
- ❌ Прокидывать Prisma ошибки наружу. Маппить в `prisma-error.helper.ts`
- ❌ Логировать PII (email, phone, имена) в сообщениях ошибок
- ❌ Возвращать стек/имена таблиц в HTTP-ответах при 500

---

## 11. Конвенции и naming

### Имена файлов (kebab-case)

```
user.entity.ts             ← agregate
email.vo.ts                ← value object
user-id.vo.ts
user-created.event.ts      ← domain event
on-user-signed-in.handler.ts ← event handler
create-user.command.ts     ← command DTO
create-user.use-case.ts    ← use case
user.repository.ts         ← port (interface)
prisma-user.repository.ts  ← adapter
user.mapper.ts             ← mapping
create-user.dto.ts         ← HTTP input DTO
user-response.dto.ts       ← HTTP output DTO
identity-provider.port.ts  ← port
keycloak.adapter.ts        ← adapter
user.module.ts             ← NestJS module
user.controller.ts         ← HTTP controller
jwt-auth.guard.ts          ← NestJS guard
public.decorator.ts        ← NestJS decorator
user.entity.spec.ts        ← test
```

### Имена классов (PascalCase без избыточных суффиксов)

| ✅ Правильно | ❌ Избыточно |
|---|---|
| `User` (в `user.entity.ts`) | `UserEntity` |
| `Email` (в `email.vo.ts`) | `EmailValueObject` |
| `CreateUserUseCase` (всегда суффикс) | `CreateUser` |
| `UserCreatedEvent` | `UserCreated` |
| `PrismaUserRepository` | `PrismaUserRepo` |

### DI токены (SCREAMING_SNAKE_CASE Symbol)

```ts
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const EVENT_BUS = Symbol('EVENT_BUS');
export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
export const TOKEN_STORE = Symbol('TOKEN_STORE');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
```

Использование:
```ts
constructor(@Inject(USER_REPOSITORY) private userRepo: UserRepository) {}
```

### Имена событий: `<context>.<action-past-tense>`

```
user.created
user.updated
user.email-verified
user.phone-verified
user.activated
auth.user-signed-in
billing.invoice-paid   (пример будущего)
```

### Папки (kebab-case)

```
value-objects/
use-cases/
event-handlers/
```

### Path aliases

Настроены в `tsconfig.json`:
```ts
import { UserId } from '@modules/user/domain/value-objects/user-id.vo';
import { AggregateRoot } from '@shared/domain/aggregate-root';
import appConfig from '@config/app.config';
```

---

## 12. Конфигурация и окружение

### Источник правды — `.env`

```env
# App
NODE_ENV=development
APP_PORT=3001
APP_PATH_PREFIX=api/v1
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=app

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Keycloak
KEYCLOAK_URL=http://localhost:8088
KEYCLOAK_REALM=app
KEYCLOAK_CLIENT_ID=app-backend
KEYCLOAK_CLIENT_SECRET=<changeme>

# Throttler (на будущее)
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

### Валидация при старте

`src/config/env.validation.ts` — Zod-схема. Запускается через `ConfigModule.forRoot({ validate })`.

**Приложение упадёт на старте**, если:
- `DATABASE_URL` не URL
- `KEYCLOAK_URL` не URL
- Любая обязательная переменная отсутствует

Это лучше, чем падать в рантайме при первом запросе.

### Доступ из кода

```ts
constructor(private config: ConfigService) {
  const port = this.config.get<number>('app.port');
  const dbUrl = this.config.get<string>('database.url');
}
```

### Никогда не хардкодить секреты

- `.env` в `.gitignore`
- `.env.example` коммитится с дефолтами/placeholders
- В CI секреты через GitHub Secrets (`${{ secrets.X }}`)

---

## 13. Логирование

### Стек

- **Pino** + `nestjs-pino` — высокопроизводительный JSON-логгер
- **pino-pretty** в dev — читаемый цветной вывод

### Формат

**Dev (pretty):**
```
[14:32:46.117] INFO: Created user from first sign-in: kc=89e86aa4... {"context":"OnUserSignedInHandler"}
```

**Prod (JSON):**
```json
{"level":30,"time":1715432598321,"pid":1234,"hostname":"app-pod","req":{"method":"POST","url":"/api/v1/auth/sign-in","id":"req-1"},"res":{"statusCode":200},"responseTime":48,"msg":"request completed"}
```

### Auto request logging

`pino-http` middleware автоматически логирует каждый HTTP запрос:
- `req.method`, `req.url`, `req.id`
- `res.statusCode`
- `responseTime` (ms)
- Уровень: `info` для 2xx, `warn` для 4xx, `error` для 5xx

### Уровни

Контролируется через `LOG_LEVEL` env: `fatal | error | warn | info | debug | trace`.

В dev — `debug`. В prod — `info`.

### Безопасность

`redact: ['req.headers.authorization', 'req.headers.cookie']` — `Authorization` header не утекает в логи.

### Использование в коде

Старый стиль (NestJS Logger) работает:
```ts
private readonly logger = new Logger(MyClass.name);
this.logger.log('hello');
```

Structured-логирование (если нужны поля):
```ts
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

constructor(@InjectPinoLogger(MyClass.name) private logger: PinoLogger) {}

this.logger.info({ userId: '123', action: 'sign-in' }, 'User signed in');
// → {"level":30,"userId":"123","action":"sign-in","msg":"User signed in",...}
```

---

## 14. База данных и миграции

### Prisma 7 — что важно знать

1. **`url` в `prisma.config.ts`**, не в `schema.prisma`:
   ```ts
   // prisma.config.ts
   export default defineConfig({
     schema: 'prisma/schema.prisma',
     datasource: { url: process.env.DATABASE_URL },
   });
   ```

2. **Генератор `prisma-client`** (новый), не `prisma-client-js`:
   ```prisma
   generator client {
     provider = "prisma-client"
     output   = "../src/generated/prisma"
   }
   ```

3. **Импорт клиента из `src/generated/prisma/client`**, не из `@prisma/client`:
   ```ts
   import { PrismaClient } from '../../../generated/prisma/client';
   ```

4. **MultiSchema теперь stable** — не нужно `previewFeatures = ["multiSchema"]`

5. **PrismaPg adapter** — connection через explicit driver adapter:
   ```ts
   super({ adapter: new PrismaPg({ connectionString: url }) });
   ```

### Workflow миграций

**Локально (создать миграцию):**
```bash
# 1. Изменить prisma/schema.prisma
# 2. Сгенерировать миграцию без применения
npx prisma migrate dev --create-only --name describe_change

# 3. (опционально) Допишите вручную SQL — например CHECK constraint
# 4. Применить
npx prisma migrate dev
```

**На сервере / в CI:**
```bash
npx prisma migrate deploy
```

`migrate deploy` только накатывает существующие миграции, ничего не генерирует, не дропает БД.

### Никогда не редактировать применённые миграции

Применённая миграция = неизменяемый snapshot. Нужно изменить — создать **новую** миграцию.

### CHECK constraints

Prisma не поддерживает CHECK декларативно. Допишем вручную в migration.sql:

```sql
ALTER TABLE "user"."users"
  ADD CONSTRAINT users_email_or_phone_required
  CHECK (email IS NOT NULL OR phone IS NOT NULL);
```

В первой миграции `prisma/migrations/<ts>_init/migration.sql` уже **4 CHECK constraints**:
1. Email или phone обязателен
2. `email_verified_at` требует email
3. `phone_verified_at` требует phone
4. `status = 'active'` требует verified

### Транзакции (паттерн на будущее)

Когда use case затронет **несколько aggregate-ов** — обернуть в транзакцию **в infrastructure** (не в use case). Паттерн:

```ts
// Port
export interface AccountRepository {
  runInTransaction<T>(work: (txRepo: AccountRepository) => Promise<T>): Promise<T>;
}

// Adapter
async runInTransaction(work) {
  return this.prisma.$transaction(async (tx) => {
    const txRepo = new PrismaAccountRepository(tx, this.eventBus);
    return work(txRepo);
  });
}

// Use case
await this.repo.runInTransaction(async (txRepo) => {
  const from = await txRepo.findById(cmd.from);
  const to = await txRepo.findById(cmd.to);
  from.withdraw(cmd.amount);
  to.deposit(cmd.amount);
  await txRepo.save(from);
  await txRepo.save(to);
});
```

**Запрещено:** передавать `PrismaClient` или `tx` в use case напрямую.

---

## 15. Тестирование

### Стратегия

| Слой | Тип | Что мокаем | Coverage target |
|---|---|---|---|
| `domain/` | Unit (Jest) | **ничего** — чистый TS | 90%+ |
| `application/` | Unit с моками | порты (repository, event bus, IDP) | 80%+ |
| `infrastructure/` | Integration (testcontainers) | реальная БД, HTTP-моки | happy path |
| `interfaces/` (HTTP) | E2E smoke | полный стек | ключевые сценарии |

Сейчас в проекте: **domain + application unit-тесты** (~106 тестов). Integration/E2E — TODO.

### Расположение

```
test/
├── domain/
│   ├── value-objects/
│   └── entities/
└── application/
    ├── user/
    └── auth/
```

### Паттерн mock для портов

Не используем `jest.mock()`. Делаем прямой mock-объект под interface:

```ts
const repo: jest.Mocked<UserRepository> = {
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByPhone: jest.fn(),
  findByKeycloakId: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
};

const useCase = new CreateUserUseCase(repo);
```

Это чище — порт описан явно, мок ему соответствует, нет «магии» jest.mock().

### Запуск

```bash
npm run test          # все тесты
npm run test:cov      # с coverage
```

Coverage отчёт в `coverage/lcov-report/index.html`.

### Что НЕ делать в тестах

- ❌ Тесты которые требуют реальный Postgres/Keycloak/Redis в unit-тестах
- ❌ Snapshot-тесты для backend (хрупкие, малополезные)
- ❌ Мокать конкретные классы — мокать **порты** (интерфейсы)
- ❌ Тесты на тривиальные getters

---

## 16. Локальная разработка

### Первый запуск

```bash
# 1. Клонировать
git clone https://github.com/ivatutin/njs-server.git
cd njs-server

# 2. Установить зависимости
npm install

# 3. Скопировать env
cp .env.example .env

# 4. Поднять инфру (postgres, redis, keycloak)
docker compose up -d postgres redis keycloak

# 5. Сгенерировать Prisma client
npx prisma generate

# 6. Применить миграции
npx prisma migrate dev

# 7. Запустить приложение (с hot reload)
npm run start:dev
```

Открыть `http://localhost:3001/api/v1` → `Hello World`.

### Keycloak setup (одноразово)

1. `http://localhost:8088` → admin/admin
2. Create realm `app`
3. Clients → Create client `app-backend`:
   - Client authentication: **ON**
   - Direct access grants: **ON**
4. Credentials → скопировать Client Secret → `.env` → `KEYCLOAK_CLIENT_SECRET`
5. Users → Add user:
   - Username = email (например `test@test.com`)
   - **Email verified: ON**
6. Credentials → Set password (temporary: OFF)

### Полезные команды

```bash
# Разработка
npm run start:dev              # hot-reload (SWC + watch)
npm run build                  # production build → dist/
npm start                      # запуск из dist

# Качество кода
npm run lint                   # ESLint
npm run lint:fix               # auto-fix
npm run format                 # Prettier
npm run test                   # все unit-тесты
npm run test:cov               # с coverage

# БД
npx prisma generate                                      # сгенерировать TS client
npx prisma migrate dev --create-only --name <name>       # создать миграцию без применения
npx prisma migrate dev                                    # применить
npx prisma migrate deploy                                 # на сервере / в CI
npx prisma studio                                         # GUI для БД

# Docker
docker compose up -d                                      # все сервисы
docker compose down                                       # остановить
docker compose down -v                                    # + удалить volumes
docker compose logs -f app                                # логи app
docker compose exec postgres psql -U postgres -d app      # подключиться к БД
docker compose exec app npx prisma migrate deploy         # миграция в контейнере
```

---

## 17. Docker

### Структура

- **`docker/Dockerfile`** — multi-stage build:
  - `deps` — `npm install` + `npx prisma generate`
  - `build` — `nest build` + sed post-process для Prisma client
  - `runner` — minimal `node:20-alpine`, non-root user, healthcheck на `/api/v1/health`

- **`docker-compose.yml`** — dev/default:
  - `postgres` (init-script создаёт `keycloak` БД и `user` схему)
  - `redis`
  - `keycloak` (использует postgres)
  - `app` (build из локального Dockerfile)
  - Healthchecks для всех, named volumes, bridge network

- **`docker-compose.prod.yml`** — override для prod:
  - `restart: always`
  - порты сервисов не торчат наружу
  - keycloak в `start --optimized` (требует pre-build с `KC_HOSTNAME`)
  - app использует pre-built image из GHCR

### Запуск полного стека

```bash
# Dev
docker compose up -d

# Prod
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Подводные камни

1. **npm install vs npm ci.** Lock-файл может генериться на Windows, Linux deps отличаются → `npm install` в Dockerfile вместо `npm ci`
2. **SWC quirk.** На Linux SWC иногда добавляет `.ts` extension в `require()` для generated Prisma client → post-process через `sed` в Dockerfile
3. **`libssl` в Alpine.** Prisma нужен `libssl.so.3` — он уже есть в `node:20-alpine`, отдельный `apk add openssl` не нужен
4. **Миграции в Docker.** Приложение **не запускает** миграции автоматически. Запустить:
   ```bash
   docker compose exec app npx prisma migrate deploy
   ```

### Образ в GHCR

При push в main GitHub Actions автоматически пушит в:
- `ghcr.io/ivatutin/njs-server:latest`
- `ghcr.io/ivatutin/njs-server:<sha>`

---

## 18. CI/CD

### Workflows

**`pr.yml`** — на каждый pull request:
- Install deps (с npm cache)
- `prisma generate`
- `lint` → `test` → `build`
- Fail fast: при ошибке lint — test и build не запускаются

**`main.yml`** — на push в main:
- Те же шаги что в pr.yml
- + docker build/push в GHCR с GHA cache layers

### Где смотреть

`https://github.com/ivatutin/njs-server/actions`

### Что НЕ покрыто в CI (TODO)

- Integration тесты (требуют testcontainers + Postgres в job)
- E2E через `docker compose` (можно сделать через `docker compose up -d --wait` в job)
- Security scanners (trivy, snyk)
- Code coverage отчёты в PR (можно подключить Codecov)

---

## 19. Definition of Done

Перед merge в main каждая фича должна проходить чек-лист:

- ✅ **Код написан** — соответствует архитектурным правилам, path aliases корректные
- ✅ **`npm run build` проходит** — 0 ошибок TypeScript
- ✅ **`npm run lint` проходит** — 0 errors (warnings допустимы)
- ✅ **Unit тесты написаны** для нового domain/application кода
- ✅ **`npm run test` проходит** — все зелёные
- ✅ **Endpoint проверен** — через curl или интеграционный тест
- ✅ **Domain слой чист** — `grep -r "@nestjs\|prisma" src/modules/*/domain/` → нет совпадений
- ✅ **Коммит в Conventional Commits**:
  - `feat:` новая фича
  - `fix:` баг
  - `refactor:` рефакторинг без изменения поведения
  - `chore:` инфра, конфиги, зависимости
  - `test:` тесты
  - `docs:` документация

**Пример хорошего коммита:**
```
feat(user): add updateContacts use case with email/phone invariant

- New UpdateUserContactsUseCase with uniqueness pre-check
- DTO via Zod with nullable email/phone
- 4 unit tests covering happy path and conflicts
```

---

## 20. Что НЕ делать

Критичные запреты — нарушение ведёт к деградации архитектуры:

### Архитектурные
- ❌ Прямые импорты между модулями (`auth/...` ↔ `user/...`)
- ❌ Импорт `KeycloakAdapter` в use case (нужен port `IDENTITY_PROVIDER`)
- ❌ Импорт `@nestjs/common` или `@prisma/client` в `domain/`
- ❌ Использование декораторов Prisma на domain entities (`@Entity()`)
- ❌ Cross-module доступ к таблицам других модулей через прямые SQL
- ❌ Глобальные общие сервисы с бизнес-логикой (типа `SharedService`)

### Качество кода
- ❌ `throw new Error('msg')` в domain/application — только специфичные классы
- ❌ Логирование PII (email, phone, имена) в сообщениях ошибок
- ❌ Логирование секретов, токенов, паролей
- ❌ Возврат внутренних деталей в HTTP-ответе (стек, имена таблиц)
- ❌ Бизнес-логика в контроллере (контроллер только переводит HTTP в команду)
- ❌ Возврат domain entity напрямую в HTTP (всегда через mapper)

### Безопасность
- ❌ Хардкод секретов
- ❌ Коммит `.env` (только `.env.example`)
- ❌ Передача access token в URL/query параметрах
- ❌ Логирование `Authorization` headers (redact уже настроен)

### Git
- ❌ Force-push в main
- ❌ Большие коммиты («fix all the things»)
- ❌ Коммит без сообщения / с бессмысленным сообщением
- ❌ Прямой push в main без PR (когда команда вырастет)

### Тестирование
- ❌ Snapshot-тесты для backend
- ❌ Мокать конкретные классы — мокать порты (интерфейсы)
- ❌ Тесты с реальной БД в unit-слое
- ❌ Тесты которые зависят от порядка выполнения

### Архитектурные «улучшения»
- ❌ **Kubernetes** — пока не нужен, излишняя сложность
- ❌ Микросервисы — текущий монолит покрывает потребности
- ❌ Преждевременная оптимизация (кэширование на каждый запрос, индексы без анализа)
- ❌ Использование `any` без острой необходимости

---

## 21. Roadmap

### Что отложено / технический долг

#### High priority

1. **Outbox pattern для надёжной публикации событий**
   - Сейчас события публикуются прямо из `repository.save()` после `prisma.upsert()`
   - Риск: процесс упадёт между commit и publish → событие потеряно
   - Решение: таблица `outbox`, INSERT в одной транзакции с aggregate, отдельный воркер публикует и помечает как `published`
   - Особенно критично при переходе на RabbitMQ (at-least-once delivery)

2. **Идемпотентность handlers**
   - В payload событий передавать `eventId` (UUID)
   - Handler проверяет в `processed_events` table — если уже обработано, return
   - Use case — то же с `commandId` (для retry от клиента)

3. **Flow смены подтверждённого email/phone**
   - Сейчас `updateContacts` запрещает прямую смену verified
   - Нужен новый agregate: `PendingEmailChange`, `PendingPhoneChange`
   - Flow: запросить смену → отправить код на новый адрес → подтвердить → обновить

4. **`/users/me` endpoint**
   - Возвращает данные текущего пользователя по `sub` из JWT
   - Нужен новый use case `GetUserByKeycloakIdUseCase` (или открыть `findByKeycloakId` в порте)

#### Medium priority

5. **OpenAPI / Swagger**
   - `@nestjs/swagger` интеграция
   - `nestjs-zod` умеет генерировать схемы из Zod-схем

6. **Integration тесты через testcontainers**
   - Реальная Postgres в Docker для тестов репозитория
   - Реальный Redis для TokenStore
   - В CI: testcontainers поднимает контейнеры в job

7. **E2E тесты через supertest + NestJS test module**
   - Полный стек, ключевые user flows

8. **Rate limiting**
   - `@nestjs/throttler` с Redis storage
   - Особенно на `/auth/sign-in` (защита от брутфорса)

9. **Metrics / observability**
   - Prometheus exporter
   - OpenTelemetry traces (распределённый tracing)

#### Low priority

10. **CQRS (Read/Write split)** — пока модули простые, не нужно
11. **Event Sourcing** — overkill для текущего масштаба
12. **GraphQL** — если появится потребность
13. **Soft delete** — статус `deleted` уже есть, можно завести `deleted_at` если нужен audit

### Когда что внедрять

- **Сразу:** outbox если событий станет много или они будут критичны (платежи, нотификации)
- **При росте трафика:** rate limiting, metrics
- **При появлении сложных бизнес-правил:** flow смены контактов, audit log
- **При росте команды:** OpenAPI (контракты), Codecov, более строгие PR checks

---

## Контактная информация и ресурсы

- **Repository:** `https://github.com/ivatutin/njs-server`
- **CI/CD:** GitHub Actions → `https://github.com/ivatutin/njs-server/actions`
- **Docker images:** `ghcr.io/ivatutin/njs-server`
- **CLAUDE.md** в корне `.claude/` — инструкции для AI-ассистента, содержит сжатый контекст проекта

### Полезные ссылки на материалы

- [NestJS docs](https://docs.nestjs.com)
- [Prisma docs](https://www.prisma.io/docs)
- [Domain-Driven Design Reference (Eric Evans)](https://www.domainlanguage.com/ddd/reference/)
- [Hexagonal Architecture (Alistair Cockburn)](https://alistair.cockburn.us/hexagonal-architecture/)
- [Keycloak docs](https://www.keycloak.org/documentation)

---

## Чек-лист онбординга нового разработчика

1. [ ] Прочитать этот документ полностью
2. [ ] Прочитать `CLAUDE.md` в `.claude/` (сжатые правила и текущий контекст)
3. [ ] Поднять проект локально по разделу 16
4. [ ] Зайти в Keycloak admin UI, разобраться с realm `app` и users
5. [ ] Сделать sign-in через curl и убедиться что в БД появляется User
6. [ ] Запустить `npm run test` — все тесты зелёные
7. [ ] Открыть `coverage/lcov-report/index.html` после `npm run test:cov`
8. [ ] Прочитать любой use case (например `CreateUserUseCase`) и проследить flow до Prisma
9. [ ] Создать тестовый PR с любым мелким изменением — увидеть CI в действии
10. [ ] Прочитать список «что НЕ делать» (раздел 20) перед первой задачей

---

*Этот документ живой. Если что-то изменилось в проекте — обнови соответствующий раздел.*
