# Деплой njs-server на VPS

> Пошаговая инструкция развёртывания пилотного варианта на чистом VPS (Ubuntu 22.04/24.04 LTS).
> Стек: NestJS (app) + PostgreSQL 16 + Redis 7 + Keycloak 24, всё в Docker Compose.

---

## 0. Требования к серверу

| Ресурс | Минимум | Рекомендуемо |
|---|---|---|
| vCPU | 2 | 2–4 |
| RAM | 4 GB (+2 GB swap) | 6–8 GB |
| Диск | 25 GB SSD | 40 GB SSD |
| ОС | Ubuntu 22.04/24.04 LTS | — |

Главный потребитель памяти — **Keycloak** (JVM). На 4 GB обязательно ограничивай heap (см. §6) и собирай образ в CI, а не на VPS.

Понадобится:
- доменное имя (например `api.example.com`, `auth.example.com`), A-записи указывают на IP VPS;
- доступ по SSH с правами sudo.

---

## 1. Подготовка сервера

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker + Compose plugin (официальный скрипт)
curl -fsSL https://get.docker.com | sudo sh

# Запускать docker без sudo
sudo usermod -aG docker $USER
newgrp docker   # или перелогиниться

# Проверка
docker --version
docker compose version
```

### Swap (обязательно на 4 GB)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> Порты Postgres (5432), Redis (6379), app (3001), Keycloak (8080) **наружу не открываем** — доступ только через reverse-proxy и внутреннюю docker-сеть. Прод-конфиг (`docker-compose.prod.yml`) уже убирает публикацию этих портов.

---

## 2. Получить код и образ

Есть два пути. Для пилота рекомендуется **вариант A** — образ собирается в GitHub Actions (`.github/workflows/main.yml`) и пушится в GHCR, на сервере только `pull`. Это снимает нагрузку сборки с VPS.

### Вариант A — готовый образ из GHCR (рекомендуется)

```bash
# Достаточно файлов compose + .env, но проще склонировать весь репозиторий
git clone https://github.com/ivatutin/njs-server.git
cd njs-server
```

Образ публичный? Тогда `docker pull` работает сразу. Если приватный — логин в GHCR:

```bash
# PAT с правом read:packages
echo <GITHUB_PAT> | docker login ghcr.io -u <github-username> --password-stdin
```

В `docker-compose.prod.yml` раскомментируй строку с образом в сервисе `app`:

```yaml
  app:
    image: ghcr.io/ivatutin/njs-server:latest
    build: !reset null
```

### Вариант B — сборка на сервере

```bash
git clone https://github.com/ivatutin/njs-server.git
cd njs-server
# образ соберётся из docker/Dockerfile при up (см. §5)
```
Требует ~1 GB свободной RAM на время сборки — на 4 GB машине делай только при наличии swap.

---

## 3. Настроить переменные окружения

```bash
cp .env.example .env
nano .env
```

Обязательно поменяй для прода:

```dotenv
NODE_ENV=production
LOG_LEVEL=info

# --- сильные секреты (сгенерируй: openssl rand -base64 24) ---
POSTGRES_USER=appuser
POSTGRES_PASSWORD=<СГЕНЕРИРОВАННЫЙ>
POSTGRES_DB=app
REDIS_PASSWORD=<СГЕНЕРИРОВАННЫЙ>

KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<СГЕНЕРИРОВАННЫЙ>

# --- Keycloak для приложения (заполнишь client secret после §7) ---
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=app
KEYCLOAK_CLIENT_ID=app-backend
KEYCLOAK_CLIENT_SECRET=<заполнить после настройки realm>

# --- хост Keycloak для prod-режима (твой домен auth) ---
KC_HOSTNAME=auth.example.com
```

> `DATABASE_URL`, `REDIS_HOST`, `KEYCLOAK_URL` для контейнеров переопределяются внутри `docker-compose.yml` на внутренние имена сервисов (`postgres`, `redis`, `keycloak`) — менять их в `.env` для контейнерного запуска не нужно.

---

## 4. Reverse-proxy (HTTPS)

Прод-compose намеренно не открывает порты наружу, поэтому перед app и Keycloak нужен reverse-proxy с TLS. Проще всего — **Caddy** (авто-Let's Encrypt). Создай `docker-compose.proxy.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    container_name: app-caddy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks:
      - app-network

volumes:
  caddy-data:
  caddy-config:
```

И `Caddyfile`:

```
api.example.com {
    reverse_proxy app:3001
}

auth.example.com {
    reverse_proxy keycloak:8080
}
```

Caddy подключается к той же `app-network` и ходит к контейнерам по именам.

---

## 5. Запуск

```bash
# Прод = базовый compose + prod-оверрайды (+ proxy)
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.proxy.yml \
  up -d
```

При первом старте контейнера Postgres автоматически выполнится `docker/postgres-init.sql`:
- создаст БД `keycloak` (для Keycloak);
- создаст схему `"user"` в БД `app` (нужно для Prisma multiSchema).

Проверь, что всё поднялось:

```bash
docker compose ps
docker compose logs -f keycloak   # дождись "started" (первый старт ~30–60 c)
```

---

## 6. Лимит памяти Keycloak (для 4 GB)

Добавь в сервис `keycloak` (например, в `docker-compose.prod.yml`):

```yaml
  keycloak:
    environment:
      JAVA_OPTS_KC_HEAP: "-Xms256m -Xmx512m"
    deploy:
      resources:
        limits:
          memory: 1g
```

Без этого JVM возьмёт «сколько даёт ОС» и может вызвать OOM на маленькой машине.

---

## 7. Первоначальная настройка Keycloak (разово)

1. Открой `https://auth.example.com`, войди как `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`.
2. Создай realm `app` (должен совпадать с `KEYCLOAK_REALM`).
3. Создай confidential client `app-backend` (`KEYCLOAK_CLIENT_ID`):
   - Client authentication: **On**;
   - Service accounts / нужные flows — по требованиям модуля auth.
4. Скопируй из вкладки **Credentials → Client secret**.
5. Впиши его в `.env` → `KEYCLOAK_CLIENT_SECRET` и перезапусти приложение:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app
```

Подробности — [Developer Guide §16](./DEVELOPER_GUIDE.md#16-локальная-разработка).

---

## 8. Миграции базы данных

Образ приложения **не накатывает миграции на старте** (CMD = `node dist/main.js`). Выполни их вручную после первого запуска и после каждого деплоя с новыми миграциями:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm app npx prisma migrate deploy
```

Prisma CLI и `prisma.config.ts` присутствуют в образе, так что команда работает внутри контейнера.

---

## 9. Проверка работоспособности

```bash
# Health-чек приложения
curl https://api.example.com/api/v1/health

# Swagger
# https://api.example.com/api/v1/docs
```

`health` должен вернуть статус `ok` с проверками БД/Redis.

---

## 10. Обновление (новый деплой)

```bash
cd njs-server
git pull                                    # обновить compose/конфиги

docker compose -f docker-compose.yml -f docker-compose.prod.yml pull app   # вариант A: новый образ из GHCR
# или: docker compose ... build app          # вариант B: пересборка на месте

# применить новые миграции (если есть)
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm app npx prisma migrate deploy

# перезапустить только приложение
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app
```

CI собирает и тегирует образ как `ghcr.io/ivatutin/njs-server:latest` и `:<git-sha>` — для отката используй конкретный sha-тег.

---

## 11. Бэкап и обслуживание

```bash
# Бэкап БД (app + keycloak в одном кластере Postgres)
docker compose exec postgres pg_dumpall -U appuser > backup-$(date +%F).sql

# Восстановление
cat backup-YYYY-MM-DD.sql | docker compose exec -T postgres psql -U appuser

# Логи
docker compose logs -f app

# Освободить место (старые образы)
docker image prune -f
```

Данные живут в named volumes `pg-data`, `redis-data`, `caddy-data` — они переживают `docker compose down`. **Не запускай** `down -v` на проде: `-v` удаляет volumes вместе с данными.

---

## Чеклист пилотного деплоя

- [ ] Docker + Compose установлены, swap включён, ufw настроен
- [ ] Домены `api.*` и `auth.*` указывают на IP VPS
- [ ] `.env` заполнен сильными секретами, `NODE_ENV=production`
- [ ] Reverse-proxy (Caddy) выдаёт валидный HTTPS
- [ ] Стек поднят: `docker compose ps` — все healthy
- [ ] Keycloak realm/client настроены, `KEYCLOAK_CLIENT_SECRET` вписан
- [ ] `prisma migrate deploy` выполнен
- [ ] `GET /api/v1/health` → `ok`
- [ ] Настроен бэкап Postgres (cron)
