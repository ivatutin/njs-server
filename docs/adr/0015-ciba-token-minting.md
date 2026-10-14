# ADR 0015: Выдача Keycloak-токенов phone-пользователю — CIBA

- **Дата:** 2026-10-14
- **Статус:** Accepted (механизм утверждён координатором; спайк — `docs/research/token-minting.md`)
- **Связано:** ADR-0004 (Keycloak как IdP), ADR-0011 (OTP-хранилище), ADR-0013 (issuer), ADR-0014 (каналы верификации телефона)

## Контекст

`POST /auth/sign-up/phone` и `POST /auth/sign-in/phone` (контракт v1.0/v1.2) получают
`verificationToken` от канала верификации телефона (код по SMS или обратный звонок) и должны вернуть
`TokenPair` от Keycloak. У phone-пользователя **нет пароля**: вход подтверждается владением номером,
поэтому классические `password`/`refresh_token` grants не подходят, а браузерного flow у бэкенд-клиента
`app-backend` нет. Механизм — «свобода реализации» по контракту, поэтому Phase 2 была заблокирована
именно этим выбором.

## Решение

Используем **CIBA** (`urn:openid:params:grant-type:ciba`, RFC 9396-совместимый backchannel flow) с
**HTTP-каналом аутентификации**: наш же бэкенд выступает и «consumption device» (заказывает токены),
и «authentication device» (подтверждает заявку по факту только что проверенного телефона).

Конфигурация:

- клиент `app-backend`: `oidc.ciba.grant.enabled=true`;
- Keycloak (runtime, оба compose-файла):
  `KC_SPI_CIBA_AUTH_CHANNEL__CIBA_HTTP_AUTH_CHANNEL__HTTP_AUTHENTICATION_CHANNEL_URI=http://app-backend:${APP_PORT:-3001}/${APP_PATH_PREFIX:-api/v1}/internal/ciba/channel`
  (переопределяется `CIBA_CHANNEL_URL`).

Порядок выдачи токенов:

1. `UserTokenMintService.mint()` генерирует `binding_message` (UUID) и **сначала** кладёт заявку в Redis
   (`ciba:mint:<binding_message>`, TTL 180 с, одноразовое чтение) с `{ loginHint, keycloakId, purpose, phone }`.
2. `POST /token` (`ext/ciba/auth`) с `login_hint = <телефон>`, `binding_message`, `client_secret`.
3. Keycloak шлёт уведомление на наш канал: `POST /internal/ciba/channel` с JSON-телом
   (`login_hint`, `binding_message`, …) и Bearer-токеном (`Authentication Channel ID`, JWS, `sub` = identity-пользователь).
4. Канал (`HandleCibaChannelRequestUseCase`) проверяет Bearer (JWKS + `azp` = `app-backend`), достаёт
   заявку из Redis и сверяет `sub` уведомления с ожидаемым `keycloakId`. Совпало — **отвечаем `201`**;
   не совпало/заявки нет — не-201, и Keycloak валит backchannel-запрос (`access_denied`).
5. **После** ответа `201` канал отправляет `POST /ext/ciba/auth/callback` с `{"status":"SUCCEED"}`
   и тем же Bearer (до 3 попыток).
6. `UserTokenMintService` опрашивает `POST /token` с `grant_type=…:ciba` и `auth_req_id`, соблюдая
   `interval` из ответа заявки; на `slow_down` интервал растёт на 5 с (RFC). Наружу — `TokenPair`.

## Обнаружено при реализации (живой стек, Keycloak 26.8.0)

Это не теория: все пункты ниже воспроизведены и исправлены по ходу acceptance.

1. **Callback внутри обработчика уведомления отвергается.** Пока мы держим HTTP-запрос Keycloak,
   его сессия ещё не зафиксирована: callback отвечает `403 invalid_token`. Поэтому callback уходит
   **после** ответа `201` (небольшая пауза + ретраи). `201` обязателен: любой другой статус —
   `Authentication Channel Access failed` → `503` вызывающему.
2. **Первый опрос токенов нельзя делать раньше `interval`.** Опрос сразу после заявки даёт
   `400 slow_down / too early to access`. Следствие: синхронный `sign-up/phone`/`sign-in/phone`
   занимает ≥ 5 с — это требование протокола, а не медленный код.
3. **`login_hint` резолвится только по username или email** (`KeycloakModelUtils.findUserByNameOrEmail`),
   не по id. Поэтому `username` phone-пользователя — **сам телефон** (не uuid): иначе Keycloak не найдёт
   пользователя для заявки.
4. **KC 26 требует заполненный профиль** (иначе пользователь «not fully set up»), а телефонная
   регистрация имён не спрашивает: если фронт не прислал `firstName`/`lastName`, подставляем нейтральные
   `Пользователь` / `—`. Кириллица в именах валидна.
5. **У phone-пользователя нет claim `email`**, а `TokenClaims.email` был обязательным — из-за этого
   `/users/me` отдавал `401`. Поле стало `string | null`.
6. **Порт канала внутренний**: эндпоинт не входит в контракт фронта (server-to-server), исключён из
   Swagger, наружу reverse-proxy его не публикует, доступен только из сети compose.

## Последствия

- Новых кодов ошибок контракта нет: отказ инфраструктуры (Keycloak недоступен, опрос не завершился) —
  `503`, доменные отказы — существующие `422`/`409`/`401`.
- Канал подтверждает заявку **только** при свежей одноразовой верификации телефона и совпадении
  `keycloakId`; иначе схема «сам себе решатель» превратилась бы в «выдать токены любому, кто знает
  `client_secret`».
- `binding_message` — наш корреляционный ключ (UUID, не PII); заявка живёт 3 минуты и читается один раз.
- Клиентский UX: sign-up/sign-in по телефону отвечает через ~5–15 с (заявка + подтверждение + опрос).
- Альтернатива **E (JWT Authorization Grant)** остаётся валидным планом B, если CIBA-канал окажется
  неудобен в проде (потребует обмена ключами подписи).

## Альтернативы

| Вариант | Почему нет |
| --- | --- |
| A. Технический пароль на пользователя | Конфликтует с Phase 4 (единый пароль-credential) и хранит секрет на каждого phone-пользователя |
| B/C/D. Token Exchange + impersonation, direct grant | В 26.8 требуют preview-фич/FGAP или упираются в модель доступа; спайк воспроизвёл отказы |
| E. JWT Authorization Grant | Работоспособен, но требует отдельного обмена ключами между нами и Keycloak; оставлен как план B |

## Ссылки

- `docs/research/token-minting.md` — спайк, факты и цены вариантов.
- `docs/auth-suite-backend-checklist.md` — Phase 2 (эндпоинты, acceptance).
- `src/modules/auth/infrastructure/keycloak/keycloak-ciba.adapter.ts`, `interfaces/http/ciba-channel.controller.ts`.
