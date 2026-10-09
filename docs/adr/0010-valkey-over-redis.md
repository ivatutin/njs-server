# ADR 0010: Valkey 8 вместо Redis 7 для кеша и blacklist токенов

- **Дата:** 2026-10-08
- **Статус:** Accepted

## Контекст

Redis — единственное in-memory хранилище проекта: blacklist отозванных токенов, а в Phase 0 auth-suite — OTP-challenges и rate-limit счётчики. Использовался образ `redis:7-alpine` (плавающий минорный тег, без пина патча) с `appendonly yes`.

Redis 7.4+ распространяется под RSALv2/SSPLv1, а Valkey — форк Redis 7.2.4 под BSD-3 (Linux Foundation), развиваемый при участии AWS/Google/Oracle. Для проекта, который использует только базовые структуры (string/hash с TTL), важно не столько «что новее», сколько лицензия и предсказуемость обновлений.

Клиент — `ioredis`, протокол RESP совместим, файлы AOF/RDB совместимы; сервис в compose называется `redis`, конфиг приложения читает `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`.

## Решение

- Образ: `valkey/valkey:8-alpine` (мажорный пин — «Valkey 8»).
- Команда: `valkey-server --appendonly yes`; healthcheck: `valkey-cli ping`.
- **Имя сервиса (`redis`) и env-переменные (`REDIS_*`) не меняются** — конфиг приложения, `.env`, доки и логи не трогаются.
- Пин версии PostgreSQL заодно ужесточён: `postgres:16-alpine` → `postgres:16.15-alpine` (воспроизводимость важнее автообновления патча).

## Последствия

Положительные:

- OSS-лицензия (BSD-3) и независимое от Redis Inc. развитие;
- drop-in совместимость: команды, протокол, форматы персистентности, `ioredis` — без изменений кода;
- том `redis-data` переиспользуется, миграции данных не требуется (формат AOF совместим).

Отрицательные и mitigation:

- **Расхождение имён:** сервис называется `redis`, а внутри `valkey-*`. Mitigation: явные комментарии в compose и ADR; наружу это не протекает (в коде только `REDIS_*`).
- **Своя линия патчей** — нужно следить за обновлениями Valkey, а не Redis. Mitigation: мажорный пин + регулярный пересмотр при обновлении инфраструктуры.
- Часть внешнего тулинга (например, некоторые GUI) может ожидать `redis-cli`. Mitigation: `valkey-cli` внутри контейнера; `docker compose exec redis valkey-cli`.

## Альтернативы

- **Пин `redis:7.2-alpine`** — минимальное изменение, но лицензионная история Redis и отсутствие обновлений по ветке 7.2.
- **Valkey 8 + переименование сервиса в `valkey`** — семантически честнее, но требует правок в `.env`, compose (dev + prod), документации и в коде конфига приложения — шум без функциональной выгоды.
- **Не менять Redis** — оставляет вопрос лицензии и плавающий тег `7-alpine`.

## Ссылки

- [valkey.io](https://valkey.io/), [valkey repository](https://github.com/valkey-io/valkey)
- `docker-compose.yml`, `docker-compose.prod.yml`
- ADR [0004](./0004-keycloak-as-identity-provider.md) — смежное решение по инфраструктурному компоненту
