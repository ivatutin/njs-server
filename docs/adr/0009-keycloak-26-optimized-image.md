# ADR 0009: Keycloak 26 и оптимизированный образ (build step в Dockerfile)

- **Дата:** 2026-10-08
- **Статус:** Accepted

## Контекст

Изначально Keycloak 24.0 запускался из stock-образа: `command: start-dev` в `docker-compose.yml`, а `docker-compose.prod.yml` переопределял команду на `start --optimized`. Проблема: `--optimized` валиден только для образа, **собранного** через `kc.sh build` — stock-образ так запускать нельзя, то есть prod-конфиг был фактически нерабочим.

Дополнительно при апгрейде до 26.x ломаются три вещи:

1. Переменные bootstrap-админа: `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` → `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD`.
2. Health/metrics отдаются на **management-порту 9000** (`/health/ready`, `/metrics`), а не на 8080. Прежний healthcheck был сырым TCP-чеком на 8080.
3. Heap JVM надо ограничивать явно — на 4 GB VPS Keycloak иначе может выесть всю память.

Почему 26.x, а не 24: Phase 2 auth-suite требует Token Exchange (RFC 8693), он нативный в актуальной ветке; плюс security-патчи и поддержка.

## Решение

1. **Версия:** `26.8.0` (пин патча). Базовый образ берётся из `ARG KEYCLOAK_IMAGE`
   (по умолчанию `quay.io/keycloak/keycloak:26.8.0`). Проверено на живом стенде: если CDN `quay.io`
   недоступен из сети Docker, сборка идёт с официального зеркала Docker Hub
   (`KEYCLOAK_IMAGE=docker.io/keycloak/keycloak:26.8.0`) — подлинность зеркала подтверждена
   labels образа: `version=26.8.0`, `maintainer=https://www.keycloak.org/`,
   `org.opencontainers.image.source=https://github.com/keycloak-rel/keycloak-rel`.
2. **Кастомный образ** `docker/keycloak/Dockerfile` по официальной схеме: стадия `builder` (ENV `KC_HEALTH_ENABLED`, `KC_METRICS_ENABLED`, `KC_DB=postgres` + `RUN kc.sh build`) → копирование `/opt/keycloak/` в чистый образ. Compose собирает его (`build:` + `image: app-keycloak:26.8.0`), поэтому **и** dev, **и** prod используют один и тот же оптимизированный образ.
3. **Режимы:** dev — `start-dev`, prod — `command: ["start", "--optimized"]` (+ `KC_HOSTNAME`, `KC_HTTP_ENABLED`).
4. **Bootstrap-админ:** в compose маппим `${KEYCLOAK_ADMIN}` → `KC_BOOTSTRAP_ADMIN_USERNAME`; имена переменных в `.env`/`.env.example`/DEPLOYMENT не меняются.
5. **Healthcheck:** реальный `/health/ready` на 9000 через bash-builtins (`/dev/tcp`, `read`, `[[ ]]`) — curl/wget в hardened-образ не ставим. Порт 9000 наружу не публикуем: проверка идёт изнутри контейнера.
6. **Память:** `mem_limit: 1g` + `JAVA_OPTS_APPEND: -XX:MaxRAMPercentage=70` (heap ≈ 700 MB), политика видна в compose, а не только в дефолтах образа.

## Последствия

Положительные:

- prod-режим стал действительно рабочим: `--optimized` стартует без пересборки конфигурации;
- готовность Keycloak проверяется по существу (`/health/ready`), а не по открытому TCP-порту;
- один образ для dev/prod → «работает локально» лучше коррелирует с продом;
- heap ограничен и задокументирован → предсказуемое потребление на VPS.

Отрицательные и mitigation:

- **Образ надо собирать** (`docker compose build keycloak`; в CI — на этапе docker job). Mitigation: сборка одна на весь стек, кэш слоёв.
- **Версия пинована в двух местах** (Dockerfile + тег `image:` в compose). Mitigation: обновлять вместе, контракт версии зафиксирован в ADR.
- **Миграция схемы БД.** Keycloak мигрирует её сам при старте: на живом стенде схема прошла путь
  26.4.0 → 26.4.3 → 26.6.1 → 26.6.2 → 26.7.0 → 26.8.0, realm `app` сохранился без ручных действий.
  Mitigation: перед первым прод-стартом сделать бэкап БД `keycloak` — откат к 24 после миграции схемы
  не поддерживается.
- Management-порт 9000 недоступен снаружи контейнера. Mitigation: при необходимости — `docker exec`/внутренняя сеть, наружу не выставляем осознанно.

## Альтернативы

- **Stock-образ + `start` (без `--optimized`)** — работает без сборки, но конфигурация собирается на каждом старте (медленный старт, нужен запас CPU/RAM на контейнер).
- **`start-dev` и в проде** — неприемлемо: dev-режим отключает часть защит и кэширования.
- **Оставить 24.0** — блокирует Token Exchange в Phase 2 и не получает security-патчи.
- **Публиковать 9000 наружу** — лишняя поверхность атаки, не нужна при внутреннем healthcheck.
- **`JAVA_OPTS_KC_HEAP` / ручной `-Xmx512m`** — хардкод heap вместо пропорции от лимита контейнера; `MaxRAMPercentage` корректно масштабируется.

## Ссылки

- [Running Keycloak in a container](https://www.keycloak.org/server/containers) (схема builder-stage, `kc.sh build`)
- [Keycloak upgrading guide](https://www.keycloak.org/docs/latest/upgrading/) (переименование `KC_BOOTSTRAP_ADMIN_*`)
- `docker/keycloak/Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`
