# Брокеринг соц-провайдеров через Keycloak: проверенные факты (спайк Phase 3)

- **Дата:** 2026-10-14 (живой стек, Keycloak **26.8.0**)
- **Статус:** **спайк пройден** — механизм из ADR-0016 подтверждён end-to-end, без ключей внешних провайдеров
- **Зачем:** Phase 3 (соц-вход) начинается с «попытки №1 — Generic OIDC в Keycloak». Проверить нужно было: работает ли
  brokered authorization-code + PKCE на **публичном** клиенте, хватает ли тела нашего `POST /auth/oidc/callback`
  (то есть обмена кода **без секрета**), что за пользователь появляется в реалме и переиспользуется ли он на втором входе.
- **Чего НЕ проверяли:** реальные провайдеры (Google/GitHub/VK/Yandex — нужны ключи), Telegram Widget/Bot (custom-путь).

## Стенд (dev-only, остаётся в реалме)

Вместо внешнего провайдера поднят **stub-OIDC, ходящий сам на себя**: реалм `idp-stub` в том же Keycloak.

| Объект | Где | Ключевые настройки |
| --- | --- | --- |
| реалм `idp-stub` + пользователь `stubuser` | Keycloak | email `stub@example.com`, `emailVerified` |
| клиент `app-idp-broker` | реалм `idp-stub` | confidential, `standardFlowEnabled`, redirect = broker endpoint |
| клиент **`app-web`** | реалм `app` | **public**, PKCE `S256`, redirect `http://localhost:9999/callback` |
| identity provider `stub` | реалм `app` | `providerId=oidc`, `syncMode=IMPORT`, `trustEmail=true` |
| flow `first broker login` | реалм `app` | экзекуция **Review Profile → DISABLED** (грабли №2) |

## Цепочка (6 хопов, воспроизводится скриптом)

```
GET /realms/app/protocol/openid-connect/auth?client_id=app-web&response_type=code
      &code_challenge=<S256>&code_challenge_method=S256&kc_idp_hint=stub
  hop 1 → 303  /realms/app/broker/stub/login?session_code=…
  hop 2 → 303  /realms/idp-stub/protocol/openid-connect/auth?…&client_id=app-idp-broker
  hop 3 → 200  форма логина stub-реалма  → POST username/password
         → 302  /realms/app/broker/stub/endpoint?state=…&code=<STUB_CODE>
  hop 4 → 302  /realms/app/login-actions/first-broker-login?…
  hop 5 → 302  /realms/app/broker/after-first-broker-login?…
  hop 6 → 302  http://localhost:9999/callback?state=st4te&code=<APP_CODE>&session_state=…

POST /realms/app/protocol/openid-connect/token
     grant_type=authorization_code&client_id=app-web&code=<APP_CODE>
     &redirect_uri=http://localhost:9999/callback&code_verifier=<verifier>
  → 200 { access_token, refresh_token, id_token, expires_in: 300 }
```

**Главный вывод:** обмен кода проходит **публичным клиентом с PKCE и без `client_secret`** — значит серверная часть
`POST /auth/oidc/callback` может обменять код, зная только `code`, `code_verifier` и `redirect_uri`
(ровно то тело, что предложено в `auth-v1.3-social.md`). Секрет здесь не нужен и не должен появляться.

## Что появляется в реалме `app` после первого входа

```
USER:      id=f5c78c0c-… | username=stubuser | email=stub@example.com | emailVerified=True
           firstName="Stub" | lastName="User" | enabled=True | attributes: нет
FEDERATED: { identityProvider: "stub", userId: "2653b279-…" /* = sub у IdP */, userName: "stubuser" }
CLAIMS:    sub, preferred_username=stubuser, email, email_verified=true, given_name, family_name
```

- Пользователь создаётся автоматически (`syncMode=IMPORT`), email приходит подтверждённым (`trustEmail`), имена
  мапятся из профиля IdP → наши `USER_PROVISIONING`/shadow-БД создаются тем же способом, что в email-flow
  («первый вход создаёт локальную запись»).
- **Federated identity — ровно та запись**, которую для custom-пути создаёт `addFederatedIdentity`
  (`identityProvider` + `userId` = subject провайдера + `userName`): оба пути дают одинаковую структуру связки,
  дублировать её в своей БД не нужно.
- **Повторный вход** (та же сессия браузера → SSO) отдаёт код сразу, без форм; `sub` совпал с id пользователя из
  админки (`same user as admin lookup: True`) — нового аккаунта не появляется.

## Грабли (живые, для ADR и деплой-гайда)

1. **Split-horizon адресов IdP.** Контейнеру Keycloak нельзя указывать публичные URL: первая попытка упала
   `HttpHostConnectException: Connect to localhost:8088 → Connection refused` (внутри контейнера этого порта нет).

   | Поле IdP | Значение | Почему |
   | --- | --- | --- |
   | `authorizationUrl` | `http://localhost:8088/…` | редирект делает **браузер** |
   | `tokenUrl`, `userInfoUrl`, `jwksUrl` | `http://keycloak:8080/…` | вызовы делает **контейнер** |
   | `issuer` | `http://localhost:8088/…` | должен совпасть с `iss` в id-token |

   Это тот же контур, что `KEYCLOAK_URL` vs `KEYCLOAK_ISSUER` (ADR-0013) — теперь и для IdP.
2. **Review Profile в стоковом flow.** `first broker login` содержит экзекуцию `Review Profile` = `REQUIRED`,
   поэтому **каждый первый** brokered-вход показывает страницу «обновить профиль» — даже когда провайдер отдал все
   поля. В dev её выключили (`requirement → DISABLED`). **Продовый вопрос:** оставлять шаг как UX (пользователь
   подтверждает имя/email) или импортировать молча — вопрос политики продукта, вынесен в предложение v1.3.
3. **`secret` при создании клиента через Admin API игнорируется** — Keycloak генерирует свой. Настоящее значение
   берётся из `GET /admin/realms/{realm}/clients/{id}/client-secret`; в представлении клиента секрет приходит
   замаскированным (`**********`), поэтому «прочитать и записать обратно» нельзя — только из этого эндпоинта.
4. **`kc_idp_hint`** обязателен, если фронт хочет кнопкой «Войти через X» без промежуточной страницы выбора
   провайдера (`/broker/{alias}/login`). Значит дескриптор из `GET /auth/providers` должен позволять собрать
   authorization-запрос сразу с хинтом.
5. **Владелец `state`/PKCE.** PKCE-verifier живёт у того, кто инициирует флоу, то есть у **фронта**; сверять `state`
   с «выданным нами» значением бэкенд не может, если не выдаёт его сам. Рекомендация: `state` и PKCE — фронтовые,
   а доказательство для бэкенда — сам успешный обмен кода (это ответ на вопрос №1 предложения v1.3).

## Следствия для реализации Phase 3

- Брокеренный путь **не требует** нового минта (токены приходят обменом) — совпадает с ADR-0016.
- Нужен публичный клиент `app-web` в контуре (в проде — свой redirect URI фронта) + настроенные IdP реалма.
- `GET /auth/providers` собирает дескрипторы из конфигурации (authorization endpoint + clientId + `usePkce: true`),
  а `enabled` — из env (какие провайдеры включены в контуре).
- Для custom-провайдеров (Telegram и пр.) остаётся связка «проверили подпись → `users.create` + `addFederatedIdentity`
  → токены через CIBA (ADR-0015)»; структура federated identity та же, что здесь.
