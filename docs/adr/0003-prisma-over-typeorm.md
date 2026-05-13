# ADR 0003: Prisma вместо TypeORM

- **Дата:** 2026-04-13
- **Статус:** Accepted

## Контекст

Для работы с PostgreSQL нужен ORM / DB-клиент. Принципиальное требование (из [ADR 0002](./0002-hexagonal-architecture.md)): **domain не должен зависеть от технологии хранения** (никаких декораторов `@Entity`, `@Column` на доменных сущностях).

Кандидаты в Node.js / TypeScript экосистеме:

1. **TypeORM** — самый популярный в NestJS-сообществе
2. **Prisma** — schema-first ORM с собственной DSL и генерацией клиента
3. **Drizzle ORM** — type-safe SQL builder
4. **MikroORM** — Unit of Work, Identity Map (стиль Doctrine)
5. **Knex.js** — query builder без ORM

## Решение

Выбираем **Prisma 7** с native PostgreSQL driver через `@prisma/adapter-pg`.

## Последствия

### Положительные

- **Чистое разделение слоёв.** Prisma не требует декораторов на доменных классах. Маппинг `PrismaUser` ↔ `User` (domain) живёт в **infrastructure/persistence/user.mapper.ts** — мост между схемой Prisma и domain entity. `domain/` остаётся чистым.
- **Schema-first.** Одна точка правды (`prisma/schema.prisma`) описывает модель данных. Из неё автогенерируется:
  - Типизированный клиент (`PrismaClient`) с автодополнением полей таблиц
  - Миграции (`prisma migrate dev` → SQL-файл)
  - TypeScript-типы для каждой модели
- **Миграции из коробки.** `prisma migrate dev --create-only` создаёт SQL без применения — позволяет дописать вручную (CHECK constraints, для нашего инварианта «email или phone»).
- **Лучший DX.** IDE автодополняет поля. `prisma studio` даёт GUI для просмотра БД.
- **MultiSchema поддерживается** (stable в Prisma 7) — позволяет логически разделить BC на уровне PostgreSQL schemas (`user`, в перспективе `auth`, `billing`).
- **Меньше runtime магии.** Нет lazy loading, нет proxy, нет automatic transactions. Поведение предсказуемо.

### Отрицательные

- **Сложные запросы.** Joins на несколько таблиц с условиями требуют `$queryRaw<T>` — теряется type safety. Mitigation: писать кастомные SQL только когда необходимо, оборачивать в репозиторий.
- **Прайми генерация.** Шаг `prisma generate` необходим до компиляции TS. Mitigation: автоматизировано в Dockerfile и в CI.
- **Prisma 7 — relatively new.** Breaking changes от Prisma 5/6:
  - `url` теперь в `prisma.config.ts`, не в `schema.prisma`
  - Новый генератор `prisma-client` вместо `prisma-client-js`, output в `src/generated/prisma/`
  - Driver adapter (`PrismaPg`) обязателен для PostgreSQL
  - Mitigation: всё задокументировано в [Developer Guide §14](../DEVELOPER_GUIDE.md#14-база-данных-и-миграции).
- **CHECK constraints** не поддерживаются декларативно в schema.prisma — дописываются в migration.sql вручную. Mitigation: документировано как workflow.

## Альтернативы

### TypeORM (отвергнуто)

Самый популярный ORM в NestJS-экосистеме. Богатый функционал (relations, eager/lazy loading, subscribers).

**Почему нет (главное):**
- Идиоматичный TypeORM пишет декораторы прямо на доменных сущностях:
  ```ts
  @Entity()
  class User {
    @PrimaryGeneratedColumn() id: number;
    @Column() email: string;
  }
  ```
  **Это нарушает hexagonal architecture.** Можно держать отдельный `UserOrmEntity` + mapper, но это дополнительный код и команды постоянно "срезают углы" и смешивают слои.
- Lazy loading и автоматический Unit of Work делают поведение менее предсказуемым → сложнее в тестах
- Развитие проекта замедлилось, много открытых багов
- Миграции сложнее (нужно вручную запускать `typeorm:generate`)

### Drizzle ORM (отвергнуто на этом этапе)

Type-safe SQL builder с минимумом магии. Сильный кандидат.

**Почему нет:**
- На момент выбора (апрель 2026) экосистема меньше Prisma
- Меньше готовых инструментов (нет GUI типа Studio, более новый migration tool)
- Команда не имеет опыта — Prisma более «дефолтный» выбор

**Возможный пересмотр:** если в проекте начнётся активная работа со сложными SQL-запросами, где Prisma `$queryRaw` становится частым, Drizzle может оказаться лучше.

### MikroORM (отвергнуто)

Unit of Work + Identity Map (Doctrine-style).

**Почему нет:**
- Декораторы тоже на доменных классах
- Identity Map = неявное состояние, сложнее для отладки
- Меньше распространён в Node.js экосистеме

### Knex.js (отвергнуто)

Чистый query builder без миграций моделей.

**Почему нет:**
- Нет генерации типов из схемы — придётся писать типы вручную
- Миграции есть, но не привязаны к моделям
- Слишком низкоуровневый для CRUD-операций (бойлерплейт)

## Правила использования (наш проект)

1. **Domain не импортирует ничего из Prisma.** Проверяется `grep`-ом.
2. **PrismaClient импортируется только в `infrastructure/persistence/` и `shared/infrastructure/prisma/`.**
3. **Маппинг через explicit Mapper class.** `UserMapper.toDomain(raw)` и `UserMapper.toPersistence(user)`.
4. **Ошибки Prisma мапятся в доменные** через `mapPrismaError(err)`. Use case никогда не ловит `PrismaClientKnownRequestError`.
5. **Миграции с CHECK constraints** дописываются вручную в `migration.sql` (workflow: `--create-only` → edit → apply).
6. **Транзакции** инкапсулируются в репозитории через `runInTransaction(work)` (паттерн в Developer Guide). Use case не знает о `prisma.$transaction`.

## Ссылки

- [Prisma docs](https://www.prisma.io/docs)
- [Prisma 7 release notes](https://www.prisma.io/blog/prisma-7-released)
- Сравнение: [Prisma vs TypeORM](https://www.prisma.io/docs/orm/more/comparisons/prisma-and-typeorm)
