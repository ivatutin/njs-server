# ADR 0002: Hexagonal Architecture (Ports & Adapters) внутри модулей

- **Дата:** 2026-04-10
- **Статус:** Accepted

## Контекст

Внутри каждого bounded context (`modules/user/`, `modules/auth/`) нужна **внутренняя структура слоёв**. Цель: бизнес-логика должна:

- Не зависеть от фреймворка (NestJS), БД (Prisma), HTTP, внешних сервисов
- Легко тестироваться без поднятия реальной инфраструктуры
- Позволять замену технологии (Prisma → MongoDB, Keycloak → Auth0) без переписывания

Альтернативы:

1. **Anemic 3-layer** (controller → service → repository, всё в одном пакете)
2. **Hexagonal Architecture** (ports & adapters)
3. **Clean Architecture** (Bob Martin, концептуально близко к hexagonal)
4. **Onion Architecture** (тоже близкий концепт)

## Решение

Каждый модуль организован по **Hexagonal Architecture** с четырьмя слоями:

```
interfaces/        ← HTTP controllers, DTOs (Zod), mappers
application/       ← use cases, event handlers, commands
domain/            ← entities, value objects, events, ports (interfaces), errors
infrastructure/    ← Prisma adapter, Keycloak adapter, mappers
```

**Правило зависимостей:** стрелки идут только **внутрь, к domain**:

```
interfaces ──→ application ──→ domain
                  ↑
infrastructure ───┘   (реализует порты domain'а)
```

Domain определяет **ports** (интерфейсы зависимостей):
```ts
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  // ...
}
```

Infrastructure поставляет **adapters** (реализации):
```ts
@Injectable()
export class PrismaUserRepository implements UserRepository { ... }
```

Application использует только port через DI:
```ts
constructor(@Inject(USER_REPOSITORY) private repo: UserRepository) {}
```

## Последствия

### Положительные

- **Тестируемость.** Use case покрывается unit-тестом с прямым моком порта — не нужны testcontainers/реальная БД для большинства тестов. У нас 106 тестов выполняются за ~10 секунд.
- **Подменяемость инфраструктуры.** Замена `PrismaUserRepository` → `MongoUserRepository` = один биндинг в module, ноль изменений в use case. Реальный пример: уже использовано при переходе с `prisma-client-js` на новый Prisma 7 client.
- **Чистый domain.** `grep -r "@nestjs\|prisma" src/modules/*/domain/` возвращает пустоту — это поддающийся автоматизации инвариант (можно проверять в CI).
- **Естественные границы изменений.** Изменение в HTTP-layer не требует переписать domain. Смена ORM не требует трогать controllers.
- **Документирование интентов.** Port — это **контракт**, который проще обсуждать с командой, чем код реализации.

### Отрицательные

- **Больше boilerplate.** Для одной операции `findUserById` есть: port (`UserRepository.findById`), реализация (`PrismaUserRepository.findById`), use case (`GetUserByIdUseCase`), controller метод. Для CRUD-only приложения это избыточно.
- **Кривая обучения.** Новички пробуют импортировать `PrismaUserRepository` напрямую в use case → нарушение архитектуры. Mitigation: code review + DEVELOPER_GUIDE раздел 20 ("что НЕ делать").
- **Не для всех проектов.** Простые CRUD-сервисы без сложной бизнес-логики могут обойтись 3-layer структурой. Hexagonal окупается с появлением **доменных инвариантов и нескольких реализаций портов**.

## Альтернативы

### Anemic 3-layer (отвергнуто)

`controller → service → repository`, service использует repository напрямую.

**Почему нет:**
- Service зависит от конкретного класса (`PrismaUserRepository`), не от интерфейса → утечка инфраструктуры
- Тесты service требуют jest.mock('@/path/to/repo') — хрупко
- Domain entity становится "просто DTO" (anemic) — бизнес-правила размазываются по services

### Clean Architecture (Bob Martin) (близко, но другая терминология)

Концептуально та же идея — concentric circles, dependency rule. Hexagonal — это **более раннее и более компактное** изложение того же принципа. Выбран hexagonal вокабуляр (ports & adapters) как более интуитивный.

### Onion Architecture (близко)

То же самое в другой одежде. Hexagonal vocabulary — отраслевой стандарт после книги Vernon "Implementing DDD".

## Прагматичные исключения

1. **`shared/infrastructure/` существует** и содержит технические компоненты (PrismaModule, RedisModule, LoggerModule, AllExceptionsFilter). Это **технический kernel**, не бизнес-логика, и он не нарушает hexagonal — он играет роль "drivers" вокруг domain'ов.
2. **NestJS декораторы (`@Injectable()`) разрешены в `application/`** — это часть DI-механизма, не утечка фреймворка в domain. В `domain/` декораторов нет.
3. **`ValidateTokenUseCase` экспортируется из `AuthModule`** для использования в global `JwtAuthGuard`. Это исключение из правила «модули не экспортируют ничего», обоснованное тем, что guard живёт в самом Auth и реализует `CanActivate`.

## Ссылки

- [Hexagonal Architecture — Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- [Ports and Adapters — Herberto Graça](https://herbertograca.com/2017/09/14/ports-adapters-architecture/)
- [Implementing Domain-Driven Design — Vaughn Vernon](https://www.amazon.com/Implementing-Domain-Driven-Design-Vaughn-Vernon/dp/0321834577)
