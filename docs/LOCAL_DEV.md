# Локальный запуск

Два режима работы: **dev** (инфраструктура в Docker + приложение с hot-reload на хосте) и **full Docker** (всё в контейнерах).

`.env` уже настроен под dev-режим (`DATABASE_URL=...@localhost:5432`, `REDIS_HOST=localhost`, `KEYCLOAK_URL=http://localhost:8088`). В режиме full Docker эти значения переопределяются на внутренние hostname'ы (`postgres`, `redis`, `keycloak`) через `environment:` в `docker-compose.yml`, поэтому один и тот же `.env` подходит для обоих режимов.

---

## Dev-режим (рекомендуется для разработки)

Инфраструктура (Postgres + Redis + Keycloak) — в контейнерах, приложение — локально через SWC с автоперезапуском.

### Запуск

**1. Поднять инфраструктуру** (без сервиса `app`):
```powershell
docker compose up -d postgres redis keycloak mailpit
```
Если auth не трогаешь, Keycloak можно не поднимать:
```powershell
docker compose up -d postgres redis
```

> **Mailpit и профиль.** Сервис `mailpit` объявлен в `docker-compose.yml` **под профилем `mail`**, поэтому обычный
> `docker compose up -d` (все сервисы) его **не поднимает** — нужен явный вызов, как выше, либо
> `docker compose --profile mail up -d`. Реалм `app` настроен слать письма на `mailpit:1025`; **без Mailpit письмо
> теряется, а API отвечает без ошибки** — это не дефект бэкенда. Письма Keycloak (`VERIFY_EMAIL`, сброс пароля)
> смотрим на http://localhost:8025.

### Один раз: бизнес-роли реалма (для RBAC)

RBAC (`@Roles('admin')`, ADR-0020) читает `realm_access.roles` из access-токена, поэтому в реалме `app` должны
существовать бизнес-роли (`admin`, `user`) — иначе роль тестовому пользователю не назначить. Заводятся **операцией
в реалме**, а не кодом: Keycloak Admin Console → **Realm roles → Create role** (`admin`, затем `user`), далее роль
`admin` назначается пользователю в его карточке: **Role mapping → Assign role**.

Без этого нельзя ни проверить админские эндпоинты (`@Roles('admin')` ×9 в `UserController`), ни создать
`suspended`-пользователя для матрицы приёмки: `POST /users/{id}/suspend` сам под `@Roles('admin')`.

То же через админский API (`$h` — заголовок с токеном `admin-cli`, `$kc` — `http://localhost:8088`):
```powershell
# роли (идемпотентно: повторный вызов вернёт 409 — роль уже есть)
Invoke-RestMethod -Method Post "$kc/admin/realms/app/roles" -Headers $h -ContentType 'application/json' -Body '{"name":"admin"}'
Invoke-RestMethod -Method Post "$kc/admin/realms/app/roles" -Headers $h -ContentType 'application/json' -Body '{"name":"user"}'
# выдать роль admin пользователю
Invoke-RestMethod -Method Post "$kc/admin/realms/app/users/<keycloakId>/role-mappings/realm" -Headers $h `
  -ContentType 'application/json' -Body '[{"name":"admin"}]'
```
Роль применяется **после нового входа/refresh** (роль берётся из JWT), а «бизнес-роли» отделены от встроенных:
`realm-roles.ts` отфильтровывает `offline_access` / `uma_authorization` / `default-roles-*`.

**2. Только при первом запуске / после изменения схемы** — Prisma:
```powershell
npx prisma generate      # сгенерировать клиент в src/generated/prisma
npx prisma migrate dev   # применить миграции к БД
```

**3. Запустить приложение с hot-reload:**
```powershell
npm run start:dev
```

Повседневно (клиент уже сгенерирован, миграции применены) достаточно шага 1 + шага 3.

### Адреса

| Сервис | URL |
|---|---|
| API | http://localhost:3001/api/v1 |
| Swagger UI | http://localhost:3001/api/v1/docs |
| Health | http://localhost:3001/api/v1/health |
| Keycloak | http://localhost:8088 |
| Postgres | localhost:5432 |
| Redis (Valkey 8) | localhost:6379 — в этом окружении **6380** (`REDIS_HOST_PORT` в `.env`: 6379 занят контейнером другого проекта) |
| Mailpit (письма Keycloak) | UI http://localhost:8025 · SMTP localhost:1025 |

### Остановка

```powershell
# 1. Приложение: Ctrl+C в терминале, где запущен npm run start:dev

# 2. Инфраструктура (выбери один вариант):
docker compose stop        # остановить, контейнеры сохранить (быстрый повторный старт)
docker compose down        # остановить и удалить контейнеры (данные в volumes сохраняются)
docker compose down -v     # + удалить данные (чистая БД с нуля)
```

---

## Full Docker (prod-подобный режим)

Без hot-reload, приложение тоже в контейнере.

```powershell
docker compose up -d         # запустить весь стек, включая app
docker compose logs -f app   # смотреть логи приложения
docker compose down          # остановить весь стек
```

> ⚠️ **Контейнер `app` работает в `NODE_ENV=production`** (сервис `app` в `docker-compose.yml` задаёт
> `environment: NODE_ENV: production`, что **перебивает** `NODE_ENV=development` из `.env`). Это осознанный
> fail-closed режим, но у него есть следствие: **dev-заглушки в контейнере молчат**.
>
> | Канал | Контейнер `app` (`production`) | Приложение с хоста (`npm run start:dev`) |
> |---|---|---|
> | звонковый канал (`POST /auth/phone/call`) | **503** `dev call provider is disabled` | работает (заглушка подтверждает) |
> | письмо смены контакта (`ConsoleEmailSender`) | **503** | пишет `[dev-email]` в лог |
> | SMS-код (`ConsoleSmsSender`) | работает (код в логе) | работает |
> | письма Keycloak (verify / reset) | работают → Mailpit | работают → Mailpit |
>
> Поэтому **живую приёмку и отладку ведём на приложении с хоста**:
> `docker compose stop app` → `docker compose up -d postgres redis keycloak mailpit` → `npm run start:dev`.
> Контейнер `app` — это «prod-подобный» прогон (проверка сборки, network-режим), где dev-заглушки специально
> отказывают. Менять поведение не нужно — достаточно знать, какой режим запущен.

---

## Заметки по окружению

- **DNS-подмена.** В этой сети некоторые домены (`binaries.prisma.sh`, иногда `registry.npmjs.org`) резолвятся в заглушку `127.107.x.x`, из-за чего падают `npm install` / `prisma generate` внутри Docker. Решено глобально: в Docker Desktop → Settings → Docker Engine прописан `"dns": ["8.8.8.8", "1.1.1.1"]`.
- **Prisma 7.** `url` берётся из `prisma.config.ts` (не из `schema.prisma`); клиент импортируется из `src/generated/prisma`. Перед `npm run build` / `start:dev` нужен `npx prisma generate`.
- **Acceptance auth-suite на dev-стеке.** Коды dev-SMS/звонков читаются из логов приложения:
  `docker logs app-backend --tail 200` (строка `[dev-sms] … code=123456`; фильтруй по маскированному номеру, а не «первый матч»).
  Лимитер OTP (per-target и per-IP) не даёт прогнать сценарий подряд — в dev его ключи можно снести:
  `docker exec app-redis redis-cli --scan --pattern 'otp:*'`, затем `docker exec app-redis redis-cli DEL <ключи>`
  (кулдаун цели — 60 с, `otp:rl:*` живут до часа).
- **Русские буквы в JSON из PowerShell.** `Invoke-RestMethod -Body "<json>"` отправляет строку в Latin-1, и Keycloak
  отклоняет такие имена (`error-person-name-invalid-character`). Отправляй байты:
  `Invoke-RestMethod -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8'`.
  Коды dev-SMS при этом надёжнее читать через `regex` по строке лога конкретного номера.
