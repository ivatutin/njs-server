# Локальный запуск

Два режима работы: **dev** (инфраструктура в Docker + приложение с hot-reload на хосте) и **full Docker** (всё в контейнерах).

`.env` уже настроен под dev-режим (`DATABASE_URL=...@localhost:5432`, `REDIS_HOST=localhost`, `KEYCLOAK_URL=http://localhost:8088`). В режиме full Docker эти значения переопределяются на внутренние hostname'ы (`postgres`, `redis`, `keycloak`) через `environment:` в `docker-compose.yml`, поэтому один и тот же `.env` подходит для обоих режимов.

---

## Dev-режим (рекомендуется для разработки)

Инфраструктура (Postgres + Redis + Keycloak) — в контейнерах, приложение — локально через SWC с автоперезапуском.

### Запуск

**1. Поднять инфраструктуру** (без сервиса `app`):
```powershell
docker compose up -d postgres redis keycloak
```
Если auth не трогаешь, Keycloak можно не поднимать:
```powershell
docker compose up -d postgres redis
```

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
| Redis | localhost:6379 |

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

---

## Заметки по окружению

- **DNS-подмена.** В этой сети некоторые домены (`binaries.prisma.sh`, иногда `registry.npmjs.org`) резолвятся в заглушку `127.107.x.x`, из-за чего падают `npm install` / `prisma generate` внутри Docker. Решено глобально: в Docker Desktop → Settings → Docker Engine прописан `"dns": ["8.8.8.8", "1.1.1.1"]`.
- **Prisma 7.** `url` берётся из `prisma.config.ts` (не из `schema.prisma`); клиент импортируется из `src/generated/prisma`. Перед `npm run build` / `start:dev` нужен `npx prisma generate`.
