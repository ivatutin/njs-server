# ADR 0006: Defense in Depth для доменных инвариантов

- **Дата:** 2026-04-15
- **Статус:** Accepted

## Контекст

В доменной модели есть **инварианты** — правила, которые должны выполняться всегда. Пример: «`User` должен иметь хотя бы один из `email` или `phone`».

Вопрос: **где обеспечивать инвариант?**

Возможные места:
1. HTTP DTO (валидация на границе системы)
2. Доменная сущность (`User.create()`)
3. Use case (явная проверка перед сохранением)
4. БД (CHECK constraint)
5. Репозиторий (маппинг ошибок БД)

Можно выбрать одно или несколько мест.

## Решение

Используем **defense in depth** — инвариант проверяется на **нескольких уровнях**. Если один уровень обойдён, следующий ловит ошибку.

Для инварианта «email или phone обязателен» проверка на **4 уровнях**:

1. **HTTP DTO** (Zod):
   ```ts
   .refine(d => d.email !== undefined || d.phone !== undefined, {
     message: 'Either email or phone must be provided',
   })
   ```
   → 400 Bad Request на границе, не доходя до бизнес-логики.

2. **Domain entity** (`User.create()`):
   ```ts
   if (!email && phone.getValue() === null) {
     throw new InvalidContactsError();
   }
   ```
   → 422 Unprocessable Entity. Защищает от использования из других мест (event handlers, тесты, будущие интеграции).

3. **БД CHECK constraint** (в начальной миграции):
   ```sql
   ALTER TABLE "user"."users"
     ADD CONSTRAINT users_email_or_phone_required
     CHECK (email IS NOT NULL OR phone IS NOT NULL);
   ```
   → Postgres `23514 check_violation`. Защищает от raw SQL, seeds, миграций данных, багов в маппере.

4. **Repository error mapping** (`prisma-error.helper.ts`):
   ```ts
   if (e.code === 'P2010' && e.meta?.code === '23514') {
     throw new InvalidContactsError();  // тот же доменный класс
   }
   ```
   → Превращает Prisma ошибку в **то же** доменное исключение, что и уровень 2. Наружу всегда летит один тип, независимо от того, кто поймал нарушение.

В CLAUDE.md также аналогично закрыты:
- `email_verified_at` без email (CHECK)
- `phone_verified_at` без phone (CHECK)
- `status = 'active'` без verified контакта (CHECK + domain)

**Итог:** битая запись физически не появится в БД, даже если кто-то обойдёт домен.

## Последствия

### Положительные

- **Гарантия консистентности.** Невозможно создать невалидную запись даже через прямой `INSERT` (что иногда делают seeds, миграции данных, отладочные скрипты).
- **Понятные ошибки в бизнес-коде.** Use case бросает `InvalidContactsError`, никогда `Error('check constraint violation 23514')`. Контроллер видит только доменные классы.
- **Раннее обнаружение.** Тесты домена ловят попытку нарушения сразу, не нужно ждать interaction с БД.
- **Независимая эволюция уровней.** Можно изменить regex для phone (уровень 1) без переписывания CHECK (уровень 3) — пока новый regex не противоречит старому. Уровни не **дублируют** друг друга, а **наращивают** защиту.

### Отрицательные

- **Дублирование описания инварианта** в 3-4 местах:
  - Zod schema text: `'Either email or phone must be provided'`
  - Doc string в `User.create()`
  - SQL CHECK constraint name + condition
  - Error class message

  При изменении инварианта нужно править все 3-4 места. Mitigation: документирование (см. этот ADR + Developer Guide), code review.

- **Сложнее в простых случаях.** Для тривиального инварианта `email is required` (если бы он был) уровень БД (`NOT NULL`) + уровень DTO достаточны. Доменный класс может проигнорировать (поле обязательное в типе).

  Применяем defense in depth **только для значимых бизнес-инвариантов**, не для тривиальных field constraints.

- **CHECK constraint sql пишется руками.** Prisma не поддерживает декларативно — нужен workflow `--create-only` → edit migration.sql → apply. Это документировано.

## Где применять / не применять

### Применять

- **Доменные инварианты** на агрегате (X должен быть либо Y, либо Z; сумма счета не отрицательна; статус active требует подтверждения)
- **Уникальность** (UNIQUE constraint + pre-check в use case + маппинг P2002 в `EmailAlreadyExistsError`)
- **Ссылочная целостность** (FK constraint + domain method не позволяет null)

### НЕ применять (избыточно)

- Простые field constraints (`NOT NULL`, `max length`) — достаточно одного-двух уровней
- Чисто косметические правила (форматирование строк) — только DTO
- Бизнес-правила, которые могут поменяться часто (например, "максимум 5 ролей на пользователя" — лучше только в domain, без CHECK)

## Пример: уникальность email

Применяем тот же принцип:

1. **HTTP DTO**: `z.string().email()` — формат
2. **Use case `CreateUserUseCase`**: pre-check `findByEmail()` — для лучшего UX, понятная ошибка раньше
3. **Domain entity**: `Email` VO валидирует формат (не уникальность — domain не имеет доступа к репозиторию)
4. **БД UNIQUE constraint**: гарантирует атомарность, ловит race condition между pre-check и save
5. **Repository error mapping**: P2002 → `EmailAlreadyExistsError`

Use case получает `EmailAlreadyExistsError` независимо от того, поймал ли pre-check или БД.

## Ссылки

- [Defense in Depth — OWASP](https://wiki.owasp.org/index.php/Defense_in_depth)
- [Postgres CHECK Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Implementing Domain-Driven Design — глава про инварианты](https://www.amazon.com/Implementing-Domain-Driven-Design-Vaughn-Vernon/dp/0321834577)
