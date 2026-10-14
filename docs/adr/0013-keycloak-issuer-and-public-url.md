# ADR 0013: Issuer Keycloak и публичный адрес (`KC_HOSTNAME`)

- **Дата:** 2026-10-09
- **Статус:** Accepted

## Контекст

Keycloak подписывает токены (claim `iss`) и строит ссылки в письмах/редиректы от того
адреса, которым **себя считает**:

- если задан `KC_HOSTNAME` — это он (публичный адрес);
- иначе — хост входящего запроса.

Приложение при этом обращается к Keycloak по `KEYCLOAK_URL` (в Docker — внутренний
`http://keycloak:8080`) и проверяло `iss` как `${KEYCLOAK_URL}/realms/{realm}`. Это давало
две проблемы:

1. **Dev.** `KC_HOSTNAME` не был задан → magic link из письма получал **внутренний** хост
   (`http://keycloak:8080/...`), который из браузера не открывается; «подмена хоста»
   ломает action-token, потому что он подписан с тем же issuer
   (`EXECUTE_ACTION_TOKEN_ERROR`). Токены, выпущенные браузеру напрямую (authorization
   code / social), имели бы issuer `localhost:8088`, а бэкенд ожидал `keycloak:8080` → 401.
2. **Prod.** `docker-compose.prod.yml` задаёт `KC_HOSTNAME=auth.example.com`, а приложение
   ходит по внутреннему `http://keycloak:8080` → расхождение issuer → **все protected
   эндпоинты отдавали бы 401** (латентный баг, найденный при живой проверке Phase 1).

## Решение

Разделить «куда звонить» и «какой `iss` ожидать»:

1. Новая переменная **`KEYCLOAK_ISSUER`** (по умолчанию `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`
   — прежнее поведение сохраняется). Её использует верификатор JWT
   (`KeycloakHttpClient.issuerUrl`); JWKS по-прежнему тянется с `KEYCLOAK_URL`, потому что
   ключи не зависят от хоста.
2. **Dev:** Keycloak получает публичный адрес — `KC_HOSTNAME: ${KC_HOSTNAME:-http://localhost:8088}`
   (base `docker-compose.yml`), приложение — `KEYCLOAK_ISSUER: ${KEYCLOAK_ISSUER:-http://localhost:8088/realms/${KEYCLOAK_REALM:-app}}`.
   Ссылки в письмах становятся открываемыми из браузера, а issuer один для всех способов
   выпуска токена.
3. **Prod:** issuer выводится из публичного адреса —
   `KEYCLOAK_ISSUER: ${KEYCLOAK_ISSUER:-https://${KC_HOSTNAME:-localhost}/realms/${KEYCLOAK_REALM:-app}}`
   (при `KC_HOSTNAME=auth.example.com` → `https://auth.example.com/realms/app`).

## Проверено (09.10.2026, живой стек)

```
discovery issuer                    → http://localhost:8088/realms/app
sign-up (201) → ссылка в письме     → host = localhost:8088 (открывается из браузера)
клик по ссылке с хоста              → step1 200 → step2 200; shadow-user active, email_verified_at заполнен
POST /auth/sign-in (наш API)        → 200; iss в токене = http://localhost:8088/realms/app
GET /users/me с этим токеном        → 200 (status=active) — issuer согласован
```

## Последствия

Положительные:

- dev-ссылки в письмах открываются в браузере (раньше требовался обход внутри docker-сети);
- токены, выпущенные и бэкендом, и браузером (authorization code / social), проходят проверку;
- прод больше не имеет «тихой» ловушки с 401 из-за расхождения issuer.

Отрицательные и mitigation:

- **Появилось два связанных значения** (`KC_HOSTNAME` и `KEYCLOAK_ISSUER`). Mitigation:
  дефолты в compose выводят issuer из `KC_HOSTNAME`, поэтому расхождение возможно только
  при явном переопределении; оба значения описаны в `.env.example` и DEPLOYMENT.
- **`KC_HOSTNAME` фиксирует issuer**: открытие Keycloak по другому адресу не меняет `iss`
  (это и есть цель, но нужно помнить при отладке через IP).
- Проверка issuer не отключается: без неё токен с чужого realm мог бы приниматься.

## Альтернативы

- **Один публичный адрес для всех** (`KEYCLOAK_URL=https://auth.example.com` и внутри
  контейнера): проще, но внутренние вызовы начинают зависеть от внешнего DNS/TLS, а в dev
  не работает вовсе (`localhost` внутри контейнера — это сам контейнер).
- **`host.docker.internal` в `KC_HOSTNAME`** — тогда ссылки в письмах ведут на адрес,
  который браузер не резолвит.
- **Не проверять `iss`** — отвергнуто: снижает защиту от подмены токена.
- **Правка `KC_HOSTNAME` только в проде** — оставляет нерабочие ссылки в dev.

## Ссылки

- ADR [0009](./0009-keycloak-26-optimized-image.md), ADR [0012](./0012-email-verification-signal.md)
- `docs/DEPLOYMENT.md` § 7, `docs/DEVELOPER_GUIDE.md` § 17, `.env.example`
