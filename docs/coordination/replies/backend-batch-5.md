# Бэкенд: batch-5 — дефект профиля (400 → 503), тело ошибки Keycloak, правка рецепта CIBA

- **Кому:** сессия `njs-server` · **От кого:** координатор · **Дата:** 21.10.2026 · **Статус:** handout
- **Заморозка:** снята **частично** — разрешены код в границах п. 1 и docs в п. 2. Больше ничего не трогай.

## 1. Дефект: первый `PATCH /users/me/profile` у «пустого» пользователя → 400 Keycloak → 503

**Факт с живой приёмки фронта** (её отчёт + твой лог):

```
profile update: keycloak write failed …: Request failed with status code 400
IdentityProfileUnavailableError → 503
```

После ручного `PUT` того же представления через Admin API — `204`, и после этого API-путь заработал (`200`), включая
кириллицу. То есть дефект воспроизводим только у пользователя, у которого `firstName/lastName` **пустые**;
вероятно, read-modify-write отправляет `""`/`null`/отсутствующий `attributes` в виде, который Keycloak отклоняет.

**Что сделать:**

1. Воспроизведи на стенде: пользователь без имени (создан без `firstName/lastName`) → `PATCH /users/me/profile`.
2. **Логируй тело ответа Keycloak.** Сейчас адаптер пишет только `message(err)`
   (`keycloak-identity-profile.adapter.ts:32,49`) — `status` и `response.data` теряются, кейс неразбираемый.
   Добавь их (без PII: `userId`/`kc=…` можно, email/телефон — **нет**).
3. Починить **причину**, чтобы «пустой» профиль обновлялся; добавь тест (адаптер или use case) на этот кейс.
4. Если причина в самом Keycloak (например, `requiredActions`/`attributes` в представлении) — зафиксируй
   комментарием, почему, чтобы это не «переоткрывали» заново.

## 2. Docs: рецепт CIBA-стенда заменён (мой прошлый был неверен)

Фронт проверил живьём: `host.docker.internal` **из контейнера Keycloak недоступен** (`PORT3001_FAIL` на Windows),
поэтому схема «host-инстанс на 3001 + `CIBA_CHANNEL_URL=http://host.docker.internal:3001/...`» **не работает**.
Рабочая схема — второй инстанс в **той же сети compose**:

```powershell
docker run -d --name app-dev --network njs-server_app-network -p 3101:3001 `
  --env-file C:\WORK\v1m\njs-server\.env `
  -e NODE_ENV=development -e APP_PORT=3001 `
  -e DATABASE_URL='postgresql://postgres:postgres@postgres:5432/app?schema=public' `
  -e REDIS_HOST=redis -e REDIS_PORT=6379 `
  -e KEYCLOAK_URL=http://keycloak:8080 -e KEYCLOAK_ISSUER='http://localhost:8088/realms/app' `
  njs-server-app:latest

$env:CIBA_CHANNEL_URL='http://app-dev:3001/api/v1/internal/ciba/channel'
docker compose up -d --force-recreate keycloak

# уборка: docker rm -f app-dev; keycloak пересоздать без CIBA_CHANNEL_URL
```

Почему так: CIBA-канал должен быть доступен **из** контейнера Keycloak, а dev-провайдер звонка живёт только при
`NODE_ENV=development`; `app-dev` в сети compose закрывает оба требования, состояние челленджей общее через Redis.

→ Замени раздел «Приёмка звонкового канала (CIBA) на dev-стенде» в `docs/LOCAL_DEV.md`.

## DoD

- `npm run lint`, `npm test`, `npm run build` — зелёные; +тест на кейс «пустые имена».
- В документах — только **имена** переменных, без значений.
- Отчёт — файлом (`docs/coordination/questions/`): что воспроизвёл, **что было в теле 400**, что починил, что осталось.

**Сверено с кодом:** `keycloak-identity-profile.adapter.ts:31-33,47-50` (логируется только `message`),
`LOCAL_DEV.md:77+` (старый рецепт), живые факты — отчёт фронта `2026-10-20-finish-auth-v1-done.md`.
