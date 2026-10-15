# Деплой njs-server на VPS

> Пошаговая инструкция развёртывания пилотного варианта на чистом VPS (Ubuntu 22.04/24.04 LTS).
> Стек: NestJS (app) + PostgreSQL 16.15 + Valkey 8 + Keycloak 26.8, всё в Docker Compose.

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

# --- публичный адрес Keycloak (им подписываются токены и ссылки в письмах) ---
KC_HOSTNAME=auth.example.com

# --- опционально: ожидаемый issuer токенов ---
# По умолчанию выводится в docker-compose.prod.yml как https://${KC_HOSTNAME}/realms/${KEYCLOAK_REALM}.
# Задавайте явно, если схема/порт публичного адреса отличаются (см. ADR-0013).
# KEYCLOAK_ISSUER=https://auth.example.com/realms/app

# --- опционально: базовый образ Keycloak для сборки (если CDN quay.io недоступен) ---
# KEYCLOAK_IMAGE=docker.io/keycloak/keycloak:26.8.0

# --- подтверждение телефона обратным звонком (SMS.ru callcheck, ADR-0014) ---
# api_id из личного кабинета SMS.ru. Включает боевой канал; без ключа канал
# отвечает 503, а подтверждение доступно только SMS-кодом.
SMSRU_API_ID=<КЛЮЧ ИЗ ЛИЧНОГО КАБИНЕТА SMS.RU>
SMSRU_CALLCHECK_ENABLED=true
# Публичный https-обработчик (регистрируется у провайдера через callback/add):
#   https://<домен>/api/v1/callbacks/smsru
```

> `DATABASE_URL`, `REDIS_HOST`, `KEYCLOAK_URL` для контейнеров переопределяются внутри `docker-compose.yml` на внутренние имена сервисов (`postgres`, `redis`, `keycloak`) — менять их в `.env` для контейнерного запуска не нужно. Ожидаемый issuer токенов (`KEYCLOAK_ISSUER`) при этом остаётся **публичным** и по умолчанию выводится из `KC_HOSTNAME` (см. §7 и ADR-0013).

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

> **Первый старт дополнительно собирает образ Keycloak** (`docker/keycloak/Dockerfile`,
> build step `kc.sh build`): нужно ~1 GB свободной RAM и несколько минут. Дальше образ
> берётся из кэша. Чтобы разделить шаги — `docker compose build keycloak` перед `up -d`.

---

## 6. Лимит памяти Keycloak (для 4 GB)

Базовый `docker-compose.yml` уже задаёт `mem_limit: 1g` и
`JAVA_OPTS_APPEND: "-XX:MaxRAMPercentage=70"` — heap ≈ 700 MB, а
`MaxRAMPercentage` считается от **лимита контейнера**, не от памяти хоста.
Для 4 GB VPS этого достаточно. Если нужно ужать сильнее — переопредели в
`docker-compose.prod.yml`:

```yaml
  keycloak:
    mem_limit: 768m
    environment:
      JAVA_OPTS_APPEND: "-XX:MaxRAMPercentage=70"
```

Без лимитов JVM взяла бы «сколько даёт ОС» и могла вызвать OOM на маленькой машине.

---

## 7. Первоначальная настройка Keycloak (разово)

1. Открой `https://auth.example.com`, войди как `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`.
2. Создай realm `app` (должен совпадать с `KEYCLOAK_REALM`).
3. Создай confidential client `app-backend` (`KEYCLOAK_CLIENT_ID`):
   - Client authentication: **On**;
   - **Service accounts: On** — нужны для Admin API (создание пользователей, события);
   - в Client roles → `realm-management` выдай service account'у
     `manage-users`, `view-users`, `view-events`;
   - Direct access grants: **On** (используется `POST /auth/sign-in`);
   - Service accounts / нужные flows — по требованиям модуля auth.
4. Скопируй из вкладки **Credentials → Client secret**.
5. Включи CIBA для клиента `app-backend` — без него phone-регистрация/вход не смогут выдать токены
   (ADR-0015): **Advanced → CIBA** или атрибут `oidc.ciba.grant.enabled=true`.
   Адрес нашего канала аутентификации Keycloak берёт из окружения compose
   (`KC_SPI_CIBA_AUTH_CHANNEL__CIBA_HTTP_AUTH_CHANNEL__HTTP_AUTHENTICATION_CHANNEL_URI`),
   по умолчанию — `http://app-backend:${APP_PORT:-3001}/${APP_PATH_PREFIX:-api/v1}/internal/ciba/channel`.
   Эндпоинт внутренний: наружу его публиковать не нужно (доступен только из сети compose).
6. Для соц-входа (Phase 3, ADR-0016) нужны два объекта:
   - **публичный клиент `app-web`**: Client authentication **off**, Standard flow on, Valid redirect URIs = redirect URI
     фронта, Advanced → Proof Key for Code Exchange = **S256**. Им фронт идёт в authorization endpoint, а бэкенд
     обменивает код (`client_id` + `code_verifier`, секрета у публичного клиента нет);
   - **identity provider** (Identity providers → Add → Google/GitHub/…, либо Generic OIDC). Для OIDC-провайдера адреса
     задаются **по-разному для браузера и для контейнера**, иначе Keycloak падает с
     `Connect to localhost:8088 refused` (проверено спайком, `docs/research/social-login-broker-spike.md`):

     | Поле IdP | Значение | Почему |
     | --- | --- | --- |
     | `authorizationUrl` | публичный `https://<KC_HOSTNAME>/realms/<realm>/…` | редирект делает **браузер** |
     | `tokenUrl`, `userInfoUrl`, `jwksUrl` | внутренний `http://keycloak:8080/realms/<realm>/…` | вызовы делает **контейнер** Keycloak |
     | `issuer` | публичный `https://<KC_HOSTNAME>/realms/<realm>` | должен совпасть с `iss` в id-token |

   - **Review Profile** в flow `first broker login` — **отключить** (решение координатора Q7, 15.10.2026): пользователь
     не должен попадать на брендированную страницу Keycloak. Профиль импортируется молча, неполноту закрывают
     `needsContactCompletion` и статус `pending_verification` (см. `docs/adr/0016-social-login-providers.md`).
7. В **Realm settings → User profile** снять `required` у атрибута **`email`** (у `firstName`/`lastName` оставить).
   Иначе у phone-пользователя — а у него email нет по дизайну (ADR-0015) — **любой** password-grant падает с
   `invalid_grant / Account is not fully set up`: недоступны `POST /auth/reauth`, смена пароля и обычный вход по паролю.
   Проверка: `POST /realms/<realm>/protocol/openid-connect/token` с `grant_type=password` и логином такого
   пользователя должен отдавать токены, а не `invalid_grant`.
8. Там же (User profile) включить **`unmanagedAttributePolicy = ENABLED`**. Без этого Keycloak **молча отбрасывает**
   нестандартные атрибуты, и наши `phoneNumber` / `phoneVerified` (их пишет phone-регистрация, ADR-0015) не сохраняются.
   Проверка: `GET /admin/realms/<realm>/users/{id}` → в `attributes` видны `phoneNumber` и `phoneVerified`.
5. Впиши его в `.env` → `KEYCLOAK_CLIENT_SECRET` и перезапусти приложение:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app
```

6. **Для email-регистрации (Phase 1)** в настройках realm дополнительно:
   - **Realm settings → Email**: SMTP реального провайдера (SES/SendGrid), From = ваш домен
     (в dev вместо этого поднимается Mailpit: `docker compose up -d mailpit`);
   - **Realm settings → Events → User events: On**, `Expiration` — с запасом
     (приложение читает события `VERIFY_EMAIL` через Admin Events API, см. ADR-0012);
   - **Realm settings → Security defenses → Password policy** (например
     `length(10) and notUsername`) — иначе `422 PasswordPolicyViolation` не возникнет.

> **Issuer и публичный адрес.** Keycloak подписывает токены (`iss`) и генерирует ссылки в
> письмах от адреса, которым **себя считает** — `KC_HOSTNAME`. Приложение обращается к нему
> по внутреннему `KEYCLOAK_URL`, а ожидаемый `iss` задаётся отдельно переменной
> `KEYCLOAK_ISSUER` (в prod-compose по умолчанию выводится как
> `https://${KC_HOSTNAME}/realms/${KEYCLOAK_REALM}`). Держите `KC_HOSTNAME` равным
> публичному домену (`auth.example.com`) — тогда issuer будет
> `https://auth.example.com/realms/app`, ссылки из писем будут вести на ваш домен, а
> protected-эндпоинты не будут отдавать 401. Проверка и альтернативы — ADR-0013.

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
- [ ] SMS.ru callcheck (ADR-0014): `SMSRU_API_ID` заполнен, `SMSRU_CALLCHECK_ENABLED=true`, публичный `https`-обработчик `/api/v1/callbacks/smsru` зарегистрирован у провайдера
- [ ] `KC_HOSTNAME` = публичный домен `auth.*`, issuer согласован (ADR-0013); service account имеет `manage-users`/`view-users`/`view-events`
- [ ] SMTP для писем и User events включены (ADR-0012)
- [ ] `prisma migrate deploy` выполнен
- [ ] `GET /api/v1/health` → `ok`
- [ ] Настроен бэкап Postgres (cron)
