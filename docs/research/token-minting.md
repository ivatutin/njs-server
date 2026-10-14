# Выдача Keycloak-токенов пользователю без пароля и без браузера: проверенные факты

- **Дата:** 2026-10-14 (спайк на живом стеке, Keycloak **26.8.0**, upstream-образ)
- **Статус:** **решение принято — CIBA** (ADR-0015); ниже — проверенные факты спайка, по которым выбирали
- **Зачем:** Phase 2 (`POST /auth/sign-up/phone`, `POST /auth/sign-in/phone`) получит `verificationToken`
  от канала верификации (ADR-0014) и должен вернуть `TokenPair` от Keycloak. Механизм — «свобода
  реализации» по контракту, поэтому Phase 2 заблокирована именно этим выбором.
- **Чего НЕ проверяли:** живой `api_id` SMS.ru и уточнения у провайдера (отдельная задача).

## 1. Token Exchange с импersonation — недоступен

Документация Keycloak: стандартный exchange (V2, поддерживается и включён по умолчанию) умеет только
internal→internal; импersonation остаётся в **legacy V1** (preview + deprecated), которому нужен
**FGAP:v1** — «FGAP:v2 does not have support for token exchange permissions. This is on purpose…».
Живьём: `GET/POST /admin/realms/app/users/{id}/impersonate` → **404** на 26.8. Вариант закрыт.

## 2. CIBA — работает end-to-end ✅ (проверено живьём)

`ciba:v1` — поддерживаемая фича, включена по умолчанию (`/.well-known` отдаёт `urn:openid:params:grant-type:ciba`
и `backchannel_authentication_endpoint`). Проверенный протокол (4 шага):

**Шаг 1 — наш бэкенд заказывает заявку** (клиент должен быть confidential, флаг CIBA включён):

```
POST /realms/app/protocol/openid-connect/ext/ciba/auth
  client_id=app-backend&client_secret=…&login_hint=<username|email>&binding_message=smoke-1234&scope=openid profile
→ { "auth_req_id": "<JWE>", "expires_in": 120, "interval": 5 }
```

**Шаг 2 — Keycloak уведомляет наш «канал аутентификации»** (он же наш «решатель»):

```
POST <KC_SPI_CIBA_AUTH_CHANNEL…_URI>
Authorization: Bearer <JWT, подписанный ключами реалма RS256>
  claims: iss=<issuer>, aud=<issuer>, sub=<user id>, azp=app-backend, jti=<authReqId>, iat, exp=iat+120, typ=Bearer
Content-Type: application/json
{"scope":"openid profile profile roles email","binding_message":"smoke-1234",
 "login_hint":"phase1final+…@example.com","is_consent_required":false}
```
Ответ **`201` = «уведомление принято»** (любой другой статус → `requestAuthentication` вернёт false и
backchannel-запрос упадёт). Важно: `201` **не завершает** аутентификацию — до шага 3 токен-эндпоинт
отвечает `authorization_pending` (проверено: 3 опроса подряд).

**Шаг 3 — мы (решатель) завершаем аутентификацию callback'ом**, предъявляя **тот же Bearer**:

```
POST /realms/app/protocol/openid-connect/ext/ciba/auth/callback
Authorization: Bearer <тот же JWT из шага 2>
Content-Type: application/json
{"status":"SUCCEED"}      // либо "UNAUTHORIZED" / "CANCELLED"; можно добавить свои поля
→ 200
```
Без/с невалидным Bearer → `{"error":"invalid_token"}` (проверено). `@Consumes` — строго `application/json`.

**Шаг 4 — забираем токены (poll-режим)**: `POST /token` с `grant_type=urn:openid:params:grant-type:ciba`
и `auth_req_id`. Проверено живьём: `access_token` (1410), `refresh_token`, `id_token`, `expires_in: 300`.
Claims access-токена: `sub=bf7d94d0-…`, `azp=app-backend`, **`sid=<real session>`**, `typ=Bearer`, роли/скоупы
обычные; refresh-токен `typ=Refresh` с тем же `sid` → **refresh/logout/Account Console работают** (сессия
настоящая, а не «токен-сирота»).

**Латентность (важно для UX):** интервал `interval` ограничивает опросы *до* подтверждения. После
`SUCCEED` токены отдаются сразу — проверено: poll через 2 с после callback вернул токены (штрафа «5 секунд»
в нашем флоу нет, `cibaInterval` можно не трогать).

### Конфигурация (всё runtime, без пересборки образа — проверено)

| Где | Что |
|---|---|
| Keycloak | `KC_SPI_CIBA_AUTH_CHANNEL__CIBA_HTTP_AUTH_CHANNEL__HTTP_AUTHENTICATION_CHANNEL_URI=http://<наш-хост>:<порт>/<путь>` |
| Клиент `app-backend` | `attributes."oidc.ciba.grant.enabled" = "true"` |
| Realm | дефолты уже проставлены: `cibaBackchannelTokenDeliveryMode=poll`, `cibaInterval=5`, `cibaExpiresIn=120`, `cibaAuthRequestedUserHint=login_hint` |
| Наш сервис | один HTTP-эндпоинт канала (принимает уведомление, отвечает 201, вызывает callback) |

Резолвинг пользователя из `login_hint` делает SPI `CIBALoginUserResolver` (по умолчанию — username/email;
проверено на email). Значение `body.scope` Keycloak расширяет своими дефолтными client-scopes —
на корреляцию это не влияет.

## 3. JWT Authorization Grant (RFC 7523) — поддерживается, живьём не проверялся

Грант объявлен в discovery (`urn:ietf:params:oauth:grant-type:jwt-bearer`), в образе есть IdP
`org/keycloak/broker/jwtauthorizationgrant/JWTAuthorizationGrantIdentityProvider`. По документации нужны:
IdP-сущность в realm (тип «JWT Authorization Grant»), **pre-linked** federated identity на каждого
пользователя (`sub` assertion = id во внешнем провайдере), наш JWKS-эндпоинт и клиентские флаги.
Не проверялось живьём: CIBA оказалась дешевле по конфигурации (ни IdP, ни линков, ни JWKS).

## 4. Технический пароль + `grant_type=password` — работает, но конфликтует с Phase 4

Direct access grants на нашем клиенте уже включены (`directAccessGrantsEnabled=true`), конфигурация не нужна.
Проблема: в Keycloak **один** password-credential, поэтому ротация технического пароля при phone-входе
затрёт пароль пользователя, установленный в Phase 4 (`POST /users/me/set-password`). Годится только как
быстрый MVP с осознанно запланированным вторым механизмом.

## Сводка по вариантам

| # | Механизм | Статус в 26.8 | Проверено живьём | Цена |
|---|---|---|---|---|
| A | технический пароль + `grant_type=password` | работает | частично | минимум конфигурации; конфликт с Phase 4 |
| B | legacy Token Exchange V1 (импersonation) | preview + deprecated, нужен FGAP:v1 | ошибка воспроизведена; `impersonate` → 404 | не рекомендован |
| C | admin impersonate endpoint | **404** | да | закрыт |
| D | свои JWT | — | — | ломает единый IdP (отвергнут) |
| E | JWT Authorization Grant | поддерживается | нет (грант в discovery) | IdP + federated identity на юзера + JWKS |
| **F** | **CIBA + встроенный HTTP-канал** | **поддерживается, включена по умолчанию** | **да: уведомление, callback, токены, сессия** | 1 env у Keycloak, 1 флаг клиента, 1 наш эндпоинт |

## Что решить координатору

1. Берём **F (CIBA)** как механизм выдачи? Тогда: ADR + порт `USER_TOKEN_ISSUER` (реализация — CIBA-адаптер),
   флаги в compose/realm, acceptance по сценарию из §2.
2. Либо **E (JWT-AG)** — дороже по конфигурации, зато нет схемы «сам себе решатель».
3. До решения: незакоммиченный `KC_FEATURES=token-exchange,impersonation` в `docker/keycloak/Dockerfile`
   предлагаю **откатить** — ни один жизнеспособный вариант этой фичи не требует.

### Риски CIBA в нашем флоу

- **«Сам себе решатель»**: наш бэкенд и заказывает заявку, и подтверждает её. Безопасно **только** при
  жёстком условии — канал подтверждает заявку лишь при наличии свежей одноразовой верификации телефона
  (тот самый `verificationToken` из Phase 0/2.5). Иначе эндпоинт = «выдать токены любому по client_secret».
- Подлинность уведомления: подпись Bearer по JWKS реалма, `iss`/`aud` = issuer, `azp` = наш клиент.
- Корреляция: `binding_message` (у него есть ограничения по символам/длине) + `sub`/`login_hint`; короткий TTL.
- Сетевой доступ: Keycloak должен достучаться до нашего эндпоинта (в compose — внутренняя сеть; наружу не выставляем).
- `interval` в poll-режиме: до подтверждения опрашивать чаще нельзя (`authorization_pending`).

## Ссылки

- Исходники KC (main ≈ 26.8.1): `.../protocol/oidc/grants/ciba/channel/HttpAuthenticationChannelProvider.java`,
  `.../ciba/endpoints/BackchannelAuthenticationCallbackEndpoint.java`,
  `.../ciba/channel/AuthenticationChannelSpi.java`, `.../ciba/channel/AuthenticationChannelResponse.java`
- Документация: `keycloak.org/securing-apps/jwt-authorization-grant`, `keycloak.org/securing-apps/token-exchange`
- `docs/adr/0014-phone-verification-otp-and-call.md`, `docs/auth-suite-backend-checklist.md` (Phase 2 / 2.5)
