# Auth/Registration Suite — backend checklist

Рабочий чек-лист по реализации auth/registration API. Фронт (`vue-app-base`) пишется параллельно по зафиксированному контракту и до готовности бэка живёт на MSW-моках.

**Источники истины:**
- Полные Keycloak-вызовы, структура модулей, маппинг ошибок — `vue-app-base/docs/backend-auth-implementation.md` (spec-level, ~720 строк).
- Контракт эндпоинтов и DTO — `vue-app-base/docs/integration-backend.md` § «Auth endpoints planned».
- Архитектурные решения — `vue-app-base/docs/adr/0010..0013`.
- Реестр `errorName`, которые фронт умеет разбирать, — `vue-app-base/src/shared/api/error-codes.ts`.

Легенда: 🔴 блокирует фронт сейчас · 🟡 нужно для регистрации · 🟢 позже.

---

## ✅ Уже реализовано (не трогать)

- `POST /auth/sign-in` · `POST /auth/refresh` · `POST /auth/sign-out`
- `GET /users/me` + админский CRUD по пользователям

---

## ⚠️ Prerequisite — согласовать формат `errorName` (сделать ДО Phase 0)

Фронт матчит ошибки по строковому коду (`matchError(err, 'OtpInvalid')`), чтобы показать сообщение под конкретным полем. Строка берётся из поля `error` в теле ответа. Сейчас есть **два расхождения**, которые сломают этот матчинг:

1. **Суффикс `Error`.** `all-exceptions.filter.ts` отдаёт `error: exception.constructor.name`, то есть класс `InvalidCredentialsError` → `"InvalidCredentialsError"`. Контракт фронта ждёт `"InvalidCredentials"` (без суффикса). Касается **всех** ошибок.
2. **Доменные имена.** Бэк различает `EmailAlreadyExistsError` / `PhoneAlreadyExistsError`; фронт ждёт единый `"ContactAlreadyExists"`.

Пока не стреляло только потому, что фронт ещё нигде не зовёт `matchError` (`LoginPage` показывает сырой `message`). Для OTP-UX это обязательно.

**Рекомендация:** ввести на `DomainError` явное поле-код, не завязанное на имя класса, и отдавать его из фильтра:

```ts
// shared/domain/errors/domain.error.ts
export abstract class DomainError extends Error {
  abstract readonly code: string; // строка контракта: 'OtpInvalid', 'ContactAlreadyExists'
}
// filter: error: exception instanceof DomainError ? exception.code : exception.constructor.name
```

Тогда `class OtpInvalidError extends RuleViolationError { readonly code = 'OtpInvalid' }` — имя класса свободно, а на проводе точная строка контракта. Существующие ошибки (`InvalidCredentialsError` и т.д.) получают `code` под контракт заодно.

- [x] `DomainError.code` добавлен, фильтр отдаёт его
- [x] существующим ошибкам проставлены коды по `error-codes.ts` (`InvalidCredentials`, `ContactAlreadyExists` — общий для email/phone)
- [x] contract-тест: ответ на заведомую ошибку содержит `error` из реестра фронта

**Сделано (контракт v1.0 + v1.1):**
- `src/shared/domain/errors/error-code.ts` — реестр `ErrorCode` (21 значение: 19 из контракта v1.0/v1.1 + 2 со Phase 3).
- `DomainError.code` — контрактная строка; фолбэк «имя класса без суффикса `Error`» (поэтому `OtpInvalidError extends RuleViolationError { readonly code = 'OtpInvalid' }` работает как в снипете выше).
- `AllExceptionsFilter` отдаёт `exception.code`; ветки по базовым классам схлопнуты в один `classifyDomainError` + `domainErrorStatus`.
- Контракт v1.1 зарегистрировал 3 уже реализованных кода — `InvalidToken`, `InvalidContacts`, `UserNotFound`; в ошибках объявлены явно.
- Тесты: `test/domain/errors/domain-error.spec.ts` (включая гардрейлы контракта: снапшот реестра, «каждый наследник `DomainError` даёт непустой код из реестра», снапшот кодов, уходящих на провод) + `test/infrastructure/all-exceptions.filter.spec.ts` — 16 кейсов.

**Осталось / отложено:** `ContactNotFound` и `ContactAlreadyVerified` пока не встречаются ни в одной ошибке — появятся в Phase 4 (verify-contact flow).

**Нужен синк во фронтовом репо (вне скоупа этого репозитория):** контракт v1.1 требует добавить `InvalidToken` / `InvalidContacts` / `UserNotFound` в `vue-app-base/src/shared/api/error-codes.ts` (+ `ERROR_MESSAGES`); там же устарели примеры `error: "ConflictError"` / `"RuleViolationError"` и упоминание `error: "InvalidTokenError"` в `integration-backend.md`.

---

## 🔴 Phase 0 — OTP-сервис (фундамент, всё остальное зависит)

Инфраструктура. От неё зависят phone-регистрация, phone-вход, verify-contact и весь Phase 4.

**Инфра:**
- [x] `OtpModule` (NestJS): challenge в Redis, TTL ≤ 5 мин
- [x] хеш кода argon2id (не хранить plaintext), max 5 попыток → lock
- [x] rate-limit: per-target 3/час + per-IP 10/час + cooldown 60 c
- [x] SMS-абстракция (порт `SmsSender`) + dev-реализация (лог в консоль), prod — Twilio/SMS.ru тем же токеном
- [x] звонковая верификация — перенесено в Phase 2.5 (ADR-0014) и **принято там** (см. раздел Phase 2.5); здесь только отметка о переносе.
- [x] маскирование target для ответа: формат контракта `+7 (***) ***-12-34`, видимы реальные последние 4 цифры

**Эндпоинты:**

- [x] `POST /auth/otp/send` — public
  - body: `{ channel: 'phone', target, purpose }`
  - `purpose ∈ 'sign-up' | 'sign-in' | 'verify-contact' | 'change-contact-old' | 'change-contact-new' | 'set-password'`
  - 200 → `OtpChallengeResponse`:
    ```ts
    { challengeId, channel: 'phone', target /* masked */, expiresAt /* ISO */, cooldownSeconds, codeLength: 6 }
    ```
  - `409 ContactAlreadyExists` — только при `purpose='sign-up'`, если target занят
  - `422 OtpRateLimited` + `details: { retryAfter: number /* сек */ }`
  - **anti-enum:** `purpose='sign-in'` → **всегда 200**, даже если target не существует (реально SMS не шлём)

- [x] `POST /auth/otp/verify` — public
  - body: `{ challengeId, code }`
  - 200 → `{ challengeId, verified: true, verificationToken }`
  - `verificationToken` — короткоживущий (Redis, 10 мин), одноразовый (`GETDEL`), привязан к `{ target, purpose }`; его предъявляют в sign-up/sign-in/set-password
  - `422 OtpInvalid` — неверный код (attempts++)
  - `422 OtpExpired` — challenge не найден / TTL истёк
  - `422 OtpTooManyAttempts` — ≥5 неверных → challenge locked, нужен resend

**Коды для реестра:** `OtpInvalid`, `OtpExpired`, `OtpTooManyAttempts`, `OtpRateLimited` — уже были в реестре (v1.0), новых кодов не потребовалось; `ContactAlreadyExists` переиспользован. Для `details.retryAfter` у `DomainError` появилось поле `details`.

> `verificationToken` (контракт v1.2) выдаётся из **двух** источников: OTP-код (выше) и подтверждение обратного звонка (Phase 2.5). Ключ, TTL и одноразовость те же, поэтому потребители (`sign-up/phone`, `sign-in/phone`, `set-password`) не меняются.

**Acceptance Phase 0 — ✅ пройден на живом стеке (09.10.2026):**
```
A1 send (sign-up, новый номер)     → 200 { challengeId, target '+7 (***) ***-00-01', cooldownSeconds 60, codeLength 6 }
   код из лога dev-SMS             → 798316 (plaintext только в dev-логе)
A2 verify неверным кодом           → 422 OtpInvalid
A3 verify верным кодом             → 200 { verified: true, verificationToken: 'yPnRL-X2sb…' }
B1 resend в пределах cooldown      → 422 OtpRateLimited, details { retryAfter: 58 }
C2–C5 неверный код (4 раза)        → 422 OtpInvalid
C6 5-я неудачная попытка           → 422 OtpTooManyAttempts (челлендж залочен)
D1 sign-in для несуществующего     → 200, новой строки dev-SMS нет (anti-enumeration)
F1 sign-up на занятый номер        → 409 ContactAlreadyExists
F2 sign-in на существующий номер   → 200 + строка dev-SMS (+1)
```

**Реализация:** `src/modules/otp/*` (domain/application/infrastructure/interfaces) + ADR-0011; проверка занятости номера — shared-порт `CONTACT_LOOKUP` (реализация в user-контексте).

**Осталось вне этого репозитория:**
- фронт снимает MSW-мок с `/auth/otp/*` (процедура — в `auth-roadmap.md` **репозитория фронта**, § «Когда уходим от MSW»).
- к координатору: в `docs/auth-v1-contract.md` (раздел «Гардрейлы против тихого расхождения») ссылка `[../status.md](../status.md)` ведёт в несуществующий файл. Сам контракт правит только координатор, поэтому здесь не менял — нужно либо создать `status.md`, либо перенаправить ссылку на этот чек-лист.

---

## ⚠️ Placeholder verify-эндпоинты — решение принято (14.10.2026)

`POST /users/:id/email/verify` и `POST /users/:id/phone/verify` — по `:id`, код **не валидируют** (в JSDoc помечено placeholder). Контракт ждёт self-service `/auth/otp/*`. Фронт их не использует.

- [x] **решение: оставляем как админские тумблеры** (вне auth-suite и вне фронтового контракта) — зафиксировано в описании операций в `UserController`; выпилить можно в любой момент, обязательности нет.
- [x] **отдельная задача (нашлось при разборе) — ЗАКРЫТО (15.10.2026, RBAC):** у `UserController` не было RBAC —
      декоратор `@Roles` в проекте не использовался, поэтому **любой** аутентифицированный пользователь мог дёрнуть
      админские операции. Сделано по решению координатора (ADR-0020): роль `admin` в реалме + `@Roles('admin')`
      **по методам** (9 админских маршрутов; `GET /users/me` и `/users/me/*` — без ролей, класс-левел не ставим),
      встроенные роли (`offline_access`, `uma_authorization`, `default-roles-<realm>`) фильтруются денлистом
      в `realm-roles.ts` + разовая чистка `user.users.roles` миграцией `20261015170000_clean_builtin_roles`;
      шаг выдачи роли — `DEPLOYMENT.md §7` п.12; тесты: guard (5), фильтр ролей (4), раскладка `@Roles` (4).
      `AdminUsersController` с класс-левелом (default-deny) — отдельный рефакторинг позже.
      **Brute-force на `POST /auth/reauth` — ЗАКРЫТО (15.10.2026, решение координатора):** 5 неудачных подтверждений
      пароля на пользователя за 15 минут (порт `REAUTH_ATTEMPT_LIMITER` → `RedisReauthAttemptLimiter`, ключ
      `auth:reauth-fail:<sub>`, фиксированное окно), проверка — **до** обращения к Keycloak, считаются только неудачи,
      успех сбрасывает счётчик. Ответ на исчерпанный лимит — обычный `401 InvalidCredentials`, **без нового кода**:
      проект не даёт оракула «тебя заблокировали» (тот же принцип, что у anti-enumeration в sign-in/sign-up), поэтому
      контракт v1.3 не меняется; факт троттлинга виден в логах маркером `reauth_throttled kc=… retryAfter=Ns`.
      Если для фронта понадобится явный сигнал с отсчётом — это правка контракта (отдельным предложением).

---

## 🔴 Phase 1 — Email-регистрация (Keycloak magic link) — ✅ реализовано

- [x] `POST /auth/sign-up/email` — public
  - body: `{ email, password, acceptedTerms: true, firstName?, lastName? }`
  - 201 → `{ user: UserDto /* status: pending_verification */, verifyEmailSent: true }`
  - Keycloak: `users.create({ email, credentials: [{ type:'password', value }], emailVerified: false, requiredActions: ['VERIFY_EMAIL'] })` + `users.sendVerifyEmail(id)`
  - `409 ContactAlreadyExists` · `422 PasswordPolicyViolation` (+`details.message`) · `422 TermsNotAccepted`
  - shadow-user создаётся через shared-порт `USER_PROVISIONING` (владелец данных — user-контекст), поэтому `UserDto` возвращается синхронно
  - если письмо отправить не удалось — регистрация всё равно успешна, `verifyEmailSent: false` (повтор — через resend)

- [x] `POST /auth/verify-email/resend` — public
  - body: `{ email }` → `202` **всегда** (anti-enum)

**Инфра:**
- [x] `KeycloakEventListenerService` ловит `VERIFY_EMAIL` event → обновляет Postgres shadow user (`emailVerified=true`, `status=active`)
  - без Java-SPI: поллинг Admin Events API каждые 10 с → доменное событие `auth.email-verified` → `OnEmailVerifiedHandler` (см. ADR-0012)
  - требуется: `eventsEnabled=true`, роль `realm-management/view-events` у service account, SMTP в realm
- фронт на `/auth/verify-email` поллит `GET /users/me` каждые 5 c (на стороне фронта)

**Коды:** `ContactAlreadyExists`, `PasswordPolicyViolation`, `TermsNotAccepted` — новых кодов реестра не потребовалось.

**Acceptance Phase 1 — ✅ пройден на живом стеке (09.10.2026, Mailpit как SMTP):**
```
1. sign-up (новый email)         → 201  status=pending_verification emailVerified=false verifyEmailSent=true
2. shadow-user до верификации    → pending_verification | email_verified_at = null
3. письмо                        → Mailpit: subject 'Verify email', ссылка .../login-actions/action-token?key=…
4. клик по ссылке (2 шага, KC26) → «Email address validation» → login-actions/required-action → «Account updated»
5. Keycloak                      → emailVerified=true, requiredActions=[]
6. VERIFY_EMAIL event            → 1 событие в Admin Events
7. shadow-user после             → active | email_verified_at заполнен
8. логи приложения               → «Verified email detected: kc=…» + «Email verified: local user is now "active"»
доп.: повторный sign-up того же email → 409 ContactAlreadyExists
      acceptedTerms=false            → 422 TermsNotAccepted
      слабый пароль ('123')          → 422 PasswordPolicyViolation, details {"message":"Invalid password: minimum length 10."}
      resend (неизвестный/подтверждённый адрес) → 202 всегда
```

**Dev-окружение (проверено):** `docker compose up -d mailpit` (профиль `mail`) + настройки realm: `eventsEnabled=true`, `eventsExpiration=3600`, `smtpServer → mailpit:1025`, `passwordPolicy=length(10) and notUsername and notEmail`, service account клиента `app-backend` c ролями `manage-users` + `view-users` + `view-events`.

**Follow-up по хосту в ссылке — ✅ закрыт (ADR-0013):** добавлена переменная `KEYCLOAK_ISSUER` (по умолчанию `${KEYCLOAK_URL}/realms/${realm}`, в compose выводится из публичного адреса), а Keycloak в dev получил `KC_HOSTNAME=http://localhost:8088`. Проверено на живом стеке: ссылка из письма ведёт на публичный адрес (открывается из браузера), `iss` в токене = `http://localhost:8088/realms/app`, `POST /auth/sign-in` → 200 и `GET /users/me` с этим токеном → 200.

**Найдено попутно (для фронта и прода):** Keycloak 26 требует заполненный user profile (first/last name) — регистрация без имён оставляет аккаунт в состоянии «Account is not fully set up» (direct grant → `invalid_grant`, при входе — страница «Update Account Information»). Передавайте имена при sign-up или ослабьте требование в realm.

---

## 🟡 Phase 1.5 — Забыл пароль — ✅ реализовано

- [x] `POST /auth/forgot-password` — public
  - body: `{ email }` → `202` **всегда** (anti-enum)
  - Keycloak: `users.executeActionsEmail(id, ['UPDATE_PASSWORD'], { lifespan: 3600 })`
  - rate-limit 3/час per email
  - лимит влияет **только** на отправку письма: при превышении — тихий пропуск и всё те же 202 (лог `rate limited, letter skipped`); email в ключе Redis хешируется (PII не попадает в дампы)

**Acceptance Phase 1.5 — ✅ пройден на живом стеке (14.10.2026):**
```
1. известный адрес          → 202, письмо 'Update Your Account' в Mailpit
2. неизвестный адрес        → 202, письма нет (счётчик писем не изменился)
3. битый payload            → 400 (валидация DTO: email)
4. четвёртый запрос за час  → 202, письма нет; лог: "rate limited, letter skipped (retry in ~3578s)"
   (три письма за первые три запроса — лимит 3/час работает)
5. ссылка в письме          → host=localhost:8088 (публичный адрес, ADR-0013)
```
Новый ADR не потребовался: решение о rate-limit и TTL ссылки зафиксировано в чек-листе, паттерн счётчиков — в ADR-0011.

---

## 🟡 Phase 2 — Phone-регистрация и вход

Требует Phase 0 (verificationToken) + выбранный механизм выдачи Keycloak-токенов пользователю.
**Механизм выбран: CIBA (ADR-0015)**; конфигурация — клиентский флаг + SPI-URI канала в обоих compose-файлах.

- [x] `POST /auth/sign-up/phone` — public
  - body: `{ phone /* E.164 */, verificationToken, acceptedTerms: true, firstName?, lastName? }`
  - 201 → `{ user, tokens }`
  - Keycloak: passwordless `users.create({ username: phone, attributes: { phoneNumber: [phone], phoneVerified: ['true'] } })`; `username` — телефон, потому что CIBA-`login_hint` резолвится только по username/email (ADR-0015); имена при отсутствии в запросе — нейтральные (`Пользователь` / `—`, требование user-profile KC 26)
  - shadow-пользователь создаётся сразу с подтверждённым телефоном (`phoneVerified: true`) → `status: active`
  - `verificationToken` приходит из любого канала: OTP-код (Phase 0) или обратный звонок (Phase 2.5)
  - `422 VerificationTokenInvalid` / `VerificationTokenExpired` · `409 ContactAlreadyExists` · `503` при отказе выдачи токенов

- [x] `POST /auth/sign-in/phone` — public
  - body: `{ phone, verificationToken /* purpose='sign-in' */ }`
  - 200 → `TokenPair`
  - lookup по shadow-индексу (`User.phone` — `@unique`) → нет → `401 InvalidCredentials` (**тот же ответ**, что при wrong OTP, и **ни одного** запроса в Keycloak — anti-enum) → иначе выдача токенов тем же механизмом

**Инфра:**
- [x] механизм выдачи токенов выбран и оформлен: **ADR-0015 (CIBA)** — клиентский флаг `oidc.ciba.grant.enabled=true` + `KC_SPI_CIBA_AUTH_CHANNEL__CIBA_HTTP_AUTH_CHANNEL__HTTP_AUTHENTICATION_CHANNEL_URI` (в `docker-compose.yml` и `docker-compose.prod.yml`)
- [x] service account с `realm-management/manage-users` (создание и поиск пользователя)
- [x] lookup user по телефону — через shadow-таблицу (`User.phone @unique`), отдельный индекс не нужен
- [x] доступ к `verificationToken` из auth-контекста — shared-порт `VERIFICATION_TOKEN_CONSUMER` (OTP-модуль `@Global` отдаёт только его), без импорта модуля модулем

**Коды:** `VerificationTokenInvalid`, `VerificationTokenExpired`, `ContactAlreadyExists`, `InvalidCredentials`.

**Acceptance Phase 2 — ✅ пройден на живом стеке (14.10.2026, Keycloak 26.8.0, CIBA):**
```
otp/send (sign-up, +7999 000-01-10)      → 200 { challengeId, target '+7 (***) ***-01-10', cooldownSeconds 60 }
otp/verify                               → 200 { verified: true, verificationToken }
sign-up/phone                            → 201 за ~5 с:
  { user: { phone '+79990000110', phoneVerified true, firstName 'Иван', lastName 'Петров', status 'active' },
    tokens: { accessToken, refreshToken, expiresIn 300 } }     ← токены CIBA, сессия реальная
GET /users/me (этим accessToken)         → 200 { тот же user, status 'active', email null }
otp/send (sign-in, тот же номер)         → 200
sign-in/phone                            → 200 TokenPair за ~11 с (заявка → подтверждение → опрос)
POST /auth/refresh (его refreshToken)    → 200 TokenPair; GET /users/me с новым токеном → 200
Keycloak: users?username=%2B79990000110  → username '+79990000110', attributes { phoneNumber, phoneVerified }, sessions: clients=app-backend
Канал: POST /internal/ciba/channel без Bearer → 401 (заявку нельзя подтвердить «снаружи»)
Живые ограничения: callback — только после ответа 201 (иначе 403 invalid_token),
                   первый опрос токенов — не раньше interval (иначе 400 slow_down / too early to access)
```

**Dev-фикстуры после acceptance:** в dev-Keycloak и shadow-БД остались пары «Keycloak-пользователь + shadow-строка» для номеров
`+79990000106`…`+79990000110` (`username` = телефон); `+79990000110` — эталонный кейс из транскрипта выше (у него есть `phoneNumber`/`phoneVerified`
и сессия `app-backend`). Удалять их нужно **парами** (только KC или только БД — получится drift); `test@test.com` не трогаем.
Служебные пробы `+7999000020x`/`+7999000021x` удалены.

---

## 🟡 Phase 2.5 — Обратный звонок (SMS.ru callcheck)

Второй канал подтверждения телефона — по бизнес-требованию **основной**; SMS-код остаётся как fallback.
Контракт — **v1.2 принят** (`docs/auth-v1-contract.md`, changelog 14.10.2026); история предложения и его рассмотрения — `docs/contract-proposals/auth-v1.2-phone-call-verification.md`. Решение — ADR-0014.

Принцип: **вебхук только фиксирует `verified` и выдаёт `verificationToken`**, минт Keycloak-токенов остаётся
в `sign-up/phone` / `sign-in/phone`. Верификация и выдача токенов друг от друга не зависят.

**Эндпоинты (после принятия контракта v1.2):**

- [x] `POST /auth/phone/call` — public
  - body: `{ phone, purpose }` (тот же enum purpose, что у `otp/send`)
  - 200 → `{ challengeId, channel: 'phone', method: 'call', callTo, expiresAt /* +5 мин */, cooldownSeconds: 60, otpFallback: true }`
  - `409 ContactAlreadyExists` (только `purpose='sign-up'`) · `422 OtpRateLimited` + `details.retryAfter` · `503` при недоступности провайдера
  - **anti-enum:** `purpose='sign-in'` → всегда 200 (заявка создаётся и для незарегистрированного номера)

- [x] `GET /auth/phone/call/:challengeId` — public — **идемпотентный**, все состояния отдаются как 200 + `status`
  - 200 → `{ status: 'pending' }` · `{ status: 'verified', verificationToken }` (повторный запрос возвращает **тот же** токен) · `{ status: 'expired' }` (окно истекло / вытеснен другим каналом / неизвестный `challengeId`) · `{ status: 'failed', reason }`
  - кодов ошибок у эндпоинта нет — контракт v1.2 новых кодов не вводит (терминальное состояние = состояние ресурса, а не ошибка клиента)

**Инфра:**
- [x] порт `PHONE_CALL_PROVIDER` (`start` / `status`) + адаптер `SmsRuCallcheckProvider`: `callcheck/add` и `callcheck/status`, `ip` = **IP пользователя** (`resolveClientIp`)
- [x] челлендж-стор: поля `method`, `providerCheckId`, `callTo`; индекс `otp:call:<check_id>` → `challengeId`; `otp:active:<sha256(target|purpose)>` вытесняет прошлый челлендж (**обязательно**: привязка звонка идёт по A-номеру, параллельные заявки на один номер недопустимы)
- [x] вебхук провайдера (публичный `https`, **вне фронтового контракта**): тело не доверяем → `callcheck/status` → атомарный переход в `verified` (`SET NX`) + одноразовая выдача `verificationToken`
- [x] polling-fallback: `GET`-эндпоинт сам опрашивает провайдера (троттлинг ≥5 с) — работает без публичного вебхука (dev/CI)
- [x] кросс-канальное вытеснение: `POST /auth/otp/send` и `POST /auth/phone/call` делят один активный челлендж на `(phone, purpose)` (ключ `otp:active:<sha256(target|purpose)>`) — вытесненный отвечает `200 { status: 'expired' }`
- [x] `SMSRU_API_ID` (+ `SMSRU_CALLCHECK_ENABLED`) в `env.validation.ts` / `.env.example`; в dev/CI — фейк-провайдер
- [x] маппинг кодов провайдера: `400 → pending`, `401 → verified`, `402 → expired`, `202 → failed`, `508 → OtpRateLimited`, `301/302 → 5xx + алерт` (провайдерский `401` = «номер подтверждён» — тест обязателен)

**Уточнить у SMS.ru (блокеры дизайна):** формат тела вебхука и наличие подписи, IP-адреса отправителя для allowlist, цена, лимиты (`508`), поведение при скрытом номере (CLIR), отмена заявки.

**Коды:** новых нет — реестр не меняется (терминальные состояния — поле `status` при 200, контракт v1.2).

**Реализовано (14.10.2026):** `src/modules/otp` — порт `PhoneCallProvider`, адаптеры `SmsRuCallcheckProvider` (prod) и `ConsolePhoneCallProvider` (dev, fail-closed в проде), сервис `PhoneCallRefresher`, use-cases `StartPhoneCall` / `GetPhoneCallStatus` / `RefreshPhoneCallStatus`, контроллеры `/auth/phone/call` и `/callbacks/smsru`, ключи `otp:call:<check_id>` и `otp:claim:<id>` (`SET NX` — токен выдаётся ровно один раз), env `SMSRU_*`, общий helper `resolveClientIp` в `shared`. Тесты: 36 suites / 205 passed — включая ловушку «провайдерский `401` = номер подтверждён» и идемпотентность повторного `GET`.

**Осталось:** живой acceptance с реальным `api_id` (spike из ADR-0014) и уточнения у SMS.ru ниже. До этого боевой канал выключен (`SMSRU_CALLCHECK_ENABLED=false`) и работает dev-заглушка.

**Acceptance Phase 2.5 — ✅ пройден на живом стеке с dev-провайдером (14.10.2026, `SMSRU_DEV_CONFIRM_AFTER_SECONDS=1`):**
```
A start (sign-in, неизвестный номер) → 200 { challengeId, channel 'phone', method 'call',
                                            callTo '+7 (800) 000-00-00', cooldownSeconds 60, otpFallback true }
B GET сразу после старта             → 200 { status: 'pending' }   (опрос провайдера троттлится 5 с)
C GET через 6 с                      → 200 { status: 'verified', verificationToken: 'KXb78aTT…' }
D повторный GET                      → 200, тот же verificationToken (идемпотентность)
E неизвестный challengeId            → 200 { status: 'expired' }   (не 404/422 — требование контракта v1.2)
F вебхук с реальным check_id         → 200 { ok: true }; лог: "callback applied: challenge=… status=verified", matched=1
G вебхук с чужим check_id            → 200 { ok: true }; лог: "callback for unknown provider check_id (ignored)", matched=0
H call-челлендж → otp/send на тот же номер → GET звонка: 200 { status: 'expired' } (кросс-канальное вытеснение)
I otp/send в пределах cooldown       → 422 OtpRateLimited { retryAfter: 60 } — лимит общий для обоих каналов
```
Боевой провайдер не вызывался (dev-заглушка); маскирование PII в логах проверено: `[dev-call] purpose-phone=+7 (***) ***-00-96`.

---

## 🟢 Phase 3 — Social (VK ID / Yandex / Telegram)

> **v1.3 принят координатором (15.10.2026).** **MVP соц-входа = Keycloak-OIDC + Telegram Widget**; заморожены 3 эндпоинта:
> `GET /auth/providers`, `POST /auth/oidc/callback`, `POST /auth/providers/:id/callback` c **`:id = 'telegram-widget'`**;
> `telegram-bot` (нужен отдельный `POST /auth/providers/:id/start`), `vkid`, `yandex` — **зарезервированы**, добавляются
> отдельными предложениями. Коды `SocialAuthFailed` (422) и `ProviderAccountLinked` (409) внесены в контракт.
> Решения координатора: автопривязка провайдера по совпавшему контакту **запрещена** → `409 ProviderAccountLinked`
> либо `409 ContactAlreadyExists`; неполный профиль → обычные токены + `needsContactCompletion`, **статус аккаунта
> `pending_verification`** (новых scopes нет); `state` и PKCE — **клиентские**, доказательство для бэкенда — успешный
> обмен `code`; **Review Profile отключаем** (конфиг realm, зафиксировано в ADR-0016).
> **Реализация — вне скоупа Auth v1** (решение владельца) → в этом репозитории не начинается.
> Механизм подтверждён спайком: `docs/adr/0016-social-login-providers.md` + `docs/research/social-login-broker-spike.md`.
> Ниже — исходный список из чек-листа (для истории).
>
> **Спайк brokered-флоу пройден (14.10.2026):** `docs/research/social-login-broker-spike.md` — публичный клиент
> `app-web` (PKCE `S256`) и IdP `stub` (stub-реалм `idp-stub`) заведены в dev; код обменян **без секрета**, повторный
> вход попадает в того же пользователя. Ограничения: split-horizon адресов IdP (публичные vs внутренние) и обязательный
> `Review Profile` в стоковом flow. В проде вместо `stub` — реальные провайдеры и redirect URI фронта.

- [ ] `GET /auth/providers` → `ProviderDescriptor[]`
- [ ] `POST /auth/oidc/callback` — `{ code, state, codeVerifier, redirectUri }` → `{ user, tokens, needsContactCompletion? }` (Keycloak-brokered: Google/GitHub/VK/Yandex если Generic OIDC заведётся)
- [ ] `POST /auth/providers/:id/callback` — custom flows, `:id ∈ telegram-widget | telegram-bot | vkid | yandex`
  - Telegram Widget: validate HMAC SHA256 → `users.create` + `addFederatedIdentity`
  - Telegram Bot: сессии в Redis, OTP
  - VK/Yandex fallback: validate через provider API + `addFederatedIdentity`
- `needsContactCompletion: true` если у user нет ни email, ни phone
- **Коды:** `SocialAuthFailed`, `ProviderAccountLinked`

Попытка №1 — Generic OIDC в Keycloak; custom-эндпоинты — fallback (см. risk register в `auth-roadmap.md` репозитория фронта).

---

## 🟢 Phase 4 — Безопасность аккаунта

Требует Phase 0 (OTP) + reauth-инфру.

> **Решение получено и реализовано (15–16.10.2026):** B1 — путь B (стабильный `handle`, ADR-0017 ред. 3), B2 — семантика
> B2-1 (`503` + `Retry-After` = ничего не применено, повтор разрешён; отзыв доступа **до** применения). Ниже сохранён
> исходный текст блокировки как история решения:
> **B1** — выбор политики `username` (путь **A**: разрешить переименование в реалме; путь **B**: стабильный handle —
> рекомендация бэкенда); **B2** — проектирование частичного сбоя KC ↔ shadow (ре-чек в транзакции, идемпотентность,
> компенсация + алерт, drift-детектор). **B3** — отзыв уже выданных access-токенов — вынесен в **ADR-0018**
> и подтверждён фактом.
>
> Живые проверки (15.10.2026, Keycloak 26.8.0): админ-переименование при текущем конфиге **невозможно**
> (`400 error-user-attribute-read-only`, `editUsernameAllowed=false`), но работает при `editUsernameAllowed=true`
> + `username.permissions.edit=['admin']` (проверено: rename 204, вход по новому логину 300); login по **email**
> работает даже когда `username` — не email (rename для email-смены не нужен); email-коллизия → `409`, а телефон
> (атрибут) Keycloak **не** проверяет — уникальность держит наша БД; после `logout` старый access-токен жив (`/users/me`
> → 200), refresh → `401`.

- [x] `POST /auth/reauth` — protected — `{ password }` → `{ reauthToken, expiresAt }` (one-shot, ~5 мин, в Redis)
  - пароль проверяем password-grant'ом у Keycloak, а созданную им сессию **сразу гасим** (reauth — не вход)
  - `username` берём из админ-API (`findById`): у phone-пользователя в токене нет `email`, а логин у него — телефон
  - неверный пароль / пользователя нет в Keycloak → `401 InvalidCredentials`; новых кодов не потребовалось
  - храним **хеш** токена (`auth:reauth:<sha256>`) и привязку к `keycloakId`: украденный дамп Redis не даёт предъявить токен,
    а предъявить чужой токен нельзя
  - **находка + фикс:** в user-profile реалма `email` был `required` для роли `user`, из-за чего у phone-пользователя
    (email у него нет по дизайну) падал **любой** password-grant — `Account is not fully set up`. Требование снято (dev),
    для прода это обязательный шаг → DEPLOYMENT §7
  - не сделано (отдельная задача до прода): rate-limit на попытки reauth — на реалме стоит включить brute-force detection
- [x] `POST /users/me/contact-change/request` — protected + `X-Reauth-Token` — `{ channel: 'email'|'phone', newValue }` → `201 { changeToken, requiresOldChallenge, oldChallengeId?, newChallengeId }`
- [x] `POST /users/me/contact-change/verify` — protected — `{ changeToken, oldCode?, newCode }` → `200 UserDto`
- [x] `POST /users/me/contact-change/cancel` — protected — `{ changeToken }` → `204`
>
> **Статус блока:** все три реализованы и **приняты живьём 16.10.2026** — детали, порядок операций и acceptance
> в разделе «Phase 4 — трио `contact-change` (ADR-0017 ред. 2)» ниже. Боксы отмечены здесь как элемент трекинга,
> спека осталась в тексте рядом.
- [x] `POST /users/me/password` — protected + `X-Reauth-Token` → `{ newPassword }` → `204`
  - требование «пароль введён недавно» проверяет `ReauthTokenGuard`: токен из `POST /auth/reauth` должен принадлежать
    **тому же** пользователю (`sub` access-токена) и расходуется на входе (одноразовость) → иначе `401 ReauthTokenInvalid`
    (нет заголовка / чужой токен) или `422 ReauthTokenExpired` (истёк или уже использован)
  - политику пароля проверяет Keycloak → `422 PasswordPolicyViolation`
  - passwordless-пользователям этот путь недоступен: им нужен `set-password` (им нечего «вводить заново»)
- [x] `POST /users/me/set-password` — protected — `{ verificationToken /* purpose='set-password' */, newPassword }` → `204`
  - токен должен быть с `purpose='set-password'` **и принадлежать контакту вызывающего** (сверяем `target` токена с
    телефоном/email пользователя из Keycloak): иначе владелец валидного токена на свой номер задал бы пароль чужому аккаунту
  - пароль пишет admin API Keycloak, политику проверяет он же → `422 PasswordPolicyViolation`
  - **находка + фикс (важно для прода):** Keycloak **молча отбрасывал** наши атрибуты `phoneNumber`/`phoneVerified` —
    в user-profile реалма по умолчанию `unmanagedAttributePolicy` выключен, поэтому в Phase 2 они фактически не сохранялись
    (в админ-API `attributes` пусто). Теперь политика включена (`ENABLED`), атрибуты персистятся, и проверка «токен принадлежит
    контакту» на них опирается. Для прода это обязательный шаг → DEPLOYMENT §7

**Коды:** `ReauthTokenInvalid`, `ReauthTokenExpired`, `ChangeTokenExpired`, `ContactAlreadyExists`, `ContactChangeAlreadyPending`, `PasswordPolicyViolation`, `OtpInvalid`, `OtpExpired`.

> **Отзыв доступа (ADR-0018) реализован ✓** — `RevokeUserAccessUseCase`: Keycloak `logoutAllSessions` (ретраи 3×, не
> best-effort) → метка `auth:sub-revoked:<sub>`; вызовы из `password` и `set-password` **до** записи пароля; `sign-out`
> остаётся пер-токенным (не отзывает по `sub`). Guard: проверка `azp` нашего клиента + блоклист токена и метка по `sub`
> одним `MGET`, отсутствие `iat` → fail-closed. TTL метки = `ACCESS_TOKEN_TTL_SECONDS` + запас (одна конфигурация).
> Acceptance: старый access → `401 Token has been revoked`, refresh → `401`, свежий вход → `200`, `sign-out` не убивает
> другое устройство; окно ≤ 1 с (строгое `iat < revokedAt`) воспроизведено живьём.

**Acceptance Phase 4 (reauth) — ✅ пройден на живом стеке (15.10.2026):**
```
sign-in/phone (+79990000110)         → access token
POST /auth/reauth { password }       → 200 { reauthToken (43 симв.), expiresAt: +5 мин }
POST /auth/reauth { wrong password } → 401 InvalidCredentials
POST /auth/reauth без Authorization  → 401 Unauthorized
Redis: auth:reauth:<sha256>          ← хранится хеш, не сам токен
```
Перед этим пришлось снять `required` у `email` в user-profile реалма (иначе password-grant для phone-пользователя
падает с `Account is not fully set up`) — в проде это шаг настройки, а не код.

**Acceptance Phase 4 (set-password) — ✅ пройден на живом стеке (15.10.2026):**
```
POST /auth/otp/send { purpose: 'set-password' }   → 200 challenge
POST /auth/otp/verify                             → 200 verificationToken
POST /users/me/set-password { token, newPassword }→ 204
password-grant с новым паролем                    → 200 { expires_in: 300 }
password-grant со старым паролем                  → 400 invalid_grant   ← пароль действительно сменился
повтор с уже использованным токеном               → 422 VerificationTokenExpired (одноразовость)
слабый пароль (политика реалма length(10))        → 422 PasswordPolicyViolation
```
Источник телефона для сверки — атрибут Keycloak `phoneNumber`; для этого в реалме включён
`unmanagedAttributePolicy = ENABLED` (иначе Keycloak отбрасывает нестандартные атрибуты, см. находку выше).

**Acceptance Phase 4 (password / X-Reauth-Token) — ✅ пройден на живом стеке (15.10.2026):**
```
sign-in/phone → access token
POST /auth/reauth { password }                    → 200 reauthToken
POST /users/me/password без X-Reauth-Token        → 401 ReauthTokenInvalid ("Missing X-Reauth-Token header")
POST /users/me/password с X-Reauth-Token          → 204
повтор того же reauth-токена                      → 422 ReauthTokenExpired  ← одноразовость
password-grant с новым паролем                    → 200 { expires_in: 300 }
password-grant со старым паролем                  → 400 invalid_grant
```

Advanced-операции (отвязка провайдеров, удаление аккаунта, MFA) — нативный Keycloak Account Console, не наши эндпоинты.
**Исключение:** «выйти на всех устройствах» — теперь **наш** эндпоинт (контракт v1.4, ADR-0018), см. блок ниже.
- [x] `POST /users/me/logout-all` — protected, без тела → `204` (контракт v1.4) — подробности и живая приёмка в блоке
  «Контракт v1.4 — «выход на всех устройствах»» ниже.

---

## Политика логина — путь B: стабильный handle (ADR-0017 ред.2, решение координатора 15.10.2026)

`username` в Keycloak больше **не контакт**, а стабильный `handle` (`usr_<16 hex>`): не PII, неизменяем, уникален,
резолвится локально. `editUsernameAllowed` **не включаем** — переименования нет, значит нет и шага «переименовать логин»
(это же был единственный сценарий частичного сбоя B2 из ревью ADR-0017).

| Что | Как |
|---|---|
| Генерация | `generateLoginHandle()` (`src/shared/domain/login-handle.ts`) — при регистрации, **до** создания учётки в Keycloak |
| Хранение | `User.handle` (shadow, `@unique`, nullable) + миграция `20261015120000_add_user_handle` |
| Резолвер | shared-порт `LOGIN_HANDLE_RESOLVER` (`byPhone` / `byEmail` / `byKeycloakId`) → `PrismaLoginHandleResolver`; локальный, без вызова admin-API |
| Точки использования | `sign-up/email`, `sign-up/phone` (создание), `sign-in` (email → handle), `sign-in/phone` (CIBA `login_hint = handle`), `reauth` |
| Фолбэки | `handle = null` (строки до политики, пользователи заведённые вне наших sign-up): вход по email → сам email (`loginWithEmailAllowed=true`), `reauth` → `username` из admin-API |
| `preferred_username` | как логин не используется нигде (0 вхождений в `src`) — везде `sub` |

**Миграция данных.** Переименование в реалме невозможно (`400 error-user-attribute-read-only` при `editUsernameAllowed=false`),
реальных пользователей нет — поэтому dev-фикстуры стиля A (телефоны в `username`, `phase1*`/`phase13*`, `stubuser`,
orphan-учётки) удалены и пересоздаются уже с handle; прод-реалм стартует с политикой с первого дня. Исключение —
защищённый `test@test.com`: он не тронут, вход по email работает через фолбэк (проверено).

**Живые проверки ДО кода (15.10.2026):**
```
реалм: loginWithEmailAllowed=true, editUsernameAllowed=false (не меняем)
CIBA login_hint=usr_7c1f9a2b4d6e  → 503 server_error (KC резолвил handle и зовёт наш канал; заявки в Redis нет)
CIBA login_hint=bogus-handle-xyz  → 400 invalid_request: invalid_user   ← другой ответ ⇒ резолв реальный
password-grant по handle          → 200 { expires_in: 300 }
password-grant по email-атрибуту  → 200 { expires_in: 300 }   (username = handle, не email)
preferred_username в `src`        → 0 вхождений
```

**Acceptance пути B на живом стеке (15.10.2026):**
```
sign-up/email pathb3-39723@example.com → KC username = usr_4d6fa92bb4c74d0a, shadow.handle = тот же
sign-in (email + password)             → 200 access/refresh; GET /users/me → 200
POST /auth/reauth { password }         → 200 reauthToken      ← резолвер: byKeycloakId → handle → password-grant по handle
sign-up/phone +79990000122             → KC username = usr_1217d9590769067e, shadow.handle = тот же, keycloak_id = bb407812…
GET /admin/.../users?username=+7999…   → 0 (телефон в username не попадает); по handle → 1
POST /auth/sign-in/phone (OTP → CIBA)  → 200 { expires_in: 300 }; GET /users/me → 200   ← login_hint = handle
```
Тестовые данные: фикстуры телефонов `+79990000106…110` и прочие артефакты стиля A удалены; `test@test.com` не тронут.

## Phase 4 — трио `contact-change` (ADR-0017 ред. 2): решения координатора

Координатор закрыл развилки 15.10.2026 (финальное сообщение), реализация разрешена:

- **B2-1:** `503` на `verify` = **ничего не применено** (компенсация удалась), `changeToken` жив, повтор разрешён,
  заголовок `Retry-After`; нового кода контракта нет — `503` для недоступности инфраструктуры уже заморожен (v1.2, ADR-0015).
- **Порядок `verify`:** проверка кодов → **`RevokeUserAccessUseCase` ДО применения** (как в `password`/`set-password`) →
  shadow-транзакция с ре-чеком занятости → Keycloak (ретраи 3×) → уведомления на старый и новый контакт.
  Так состояние «применено, но не отозвано» недостижимо, а `503` однозначно означает «контакт не изменён».
- **Идемпотентность:** запись `applied` живёт до TTL `changeToken`; повторный `verify` тем же токеном → `200 UserDto`
  без повторного применения; после TTL → `422 ChangeTokenExpired`. `verify` отдаёт только `UserDto`, без токенов
  (клиент после `200`/`401` идёт на повторный вход — доступ уже отозван).
- **Прод без feature-flag**, но обязательны: actionable-алерт при `failed`/неудачной компенсации (пользователь, ключ,
  желаемое и фактическое значение в обеих системах) + короткий runbook; **drift-детектор** KC ↔ shadow
  (сверка + самопочинка идемпотентным повтором) — следующая задача после Auth v1.
- **`handle`** — «несекретный, но непубличный»: наружу (в `UserDto`/фронт) не отдаём; для поддержки — отдельным
  предложением (как это было с «выйти на всех устройствах»: предложение `auth-v1.4-logout-all.md` принято координатором
  и уже реализовано).

**Acceptance трио — ✅ пройден на живом стеке (16.10.2026):**
```
sign-in (email + password)              → 200 access token
reauth { password }                     → 200 reauthToken
request { channel: phone, newValue }    → 201 { changeToken, requiresOldChallenge: false, newChallengeId }
код из лога бэкенда ([dev-sms])         → verify { changeToken, newCode }
verify                                  → 200 UserDto: phone=+79990000124, phoneVerified=true
GET /users/me прежним access-токеном    → 401   ← отзыв доступа сработал ДО применения (ADR-0018 + B2-1)
повторный request при активной смене    → 422 ContactChangeAlreadyPending (а не OtpRateLimited)
cancel { changeToken }                  → 204; следующий request слот проходит (упёрся только в кулдаун OTP)
Keycloak (admin API)                    → attributes.phoneNumber=[+79990000124], phoneVerified=[true]
shadow (psql)                           → phone=+79990000124, phone_verified=t
```
**Найдено и исправлено приёмкой (два связанных дефекта):**
1. повторный `request` при активной смене отвечал `OtpRateLimited` от кулдауна — теперь слот проверяется
   **до** лимитов и отправки кодов (`CHANGE_TOKEN_STORE.hasActive`), фронт получает понятный `ContactChangeAlreadyPending`;
2. `PUT /users/{id}` в Keycloak — **полная замена представления**: `updateContacts` при смене телефона затирал
   `email`, `firstName`, `lastName`, после чего password-grant отвечал `invalid_grant / Account is not fully set up`.
   Теперь read-modify-write: текущее состояние переносится, меняется только контакт, `attributes` мерджятся.

**Уведомления (ADR-0017 §6) — ✅ приняты на живом стеке (16.10.2026):**
```
verify (смена телефона, requiresOldChallenge=true) → 200
[dev-sms] to=+7 (***) ***-01-29 text=Контакт в вашем аккаунте изменён…   ← новый контакт
[dev-sms] to=+7 (***) ***-01-24 text=Контакт в вашем аккаунте изменён…   ← прежний контакт
contact-change notified kc=fbfdc201... channel=phone
```
Реализация: shared-порт `CONTACT_CHANGE_NOTIFIER` → `ContactChangeNotifierAdapter` (те же каналы OTP: `SmsSender.sendText`,
`EmailSender.sendMessage`); вызов из `verify` после `markApplied`, best-effort (падение доставки логируется маскированно
и не превращает успех в `503`). Побочно приёмка подтвердила работу лимитов: `request` отдавал `422 OtpRateLimited`
с `retryAfter` на кулдаун контакта, per-IP лимит и личный лимит смен (10/сутки) — то есть защита от перебора живая.

**Drift-детектор контактов shadow ↔ Keycloak — ✅ реализован и принят (16.10.2026, ADR-0017 §3, §3a):**
```
ContactDriftDetectorService (setInterval в OnModuleInit, как KeycloakEventListenerService — без внешнего планировщика):
  keyset-пагинация по id, страницами по 100; per-user ошибки не роняют проход
  значения контактов (email/phone): Keycloak приводится к shadow — shadow источник правды
  флаги подтверждения: монотонны, «true побеждает» — дочиняется отставшая сторона, в том числе shadow
    (KC=true/shadow=false → markVerified в shadow; иначе детектор откатывал бы честную верификацию)
  в Keycloak пишутся только разошедшиеся каналы (PUT — полная замена, остальное переносит read-modify-write)
  report-only режим: CONTACT_DRIFT_HEAL_ENABLED=false — только сообщаем, не пишем
  логи: contact_drift_detected / _healed / _flag_forwarded / _heal_failed / _flag_forward_failed / _identity_missing
  env: CONTACT_DRIFT_DETECTOR_ENABLED=true, CONTACT_DRIFT_DETECTOR_INTERVAL_SECONDS=1800, CONTACT_DRIFT_HEAL_ENABLED=true
```
Тесты: `test/application/auth/contact-drift-detector.service.spec.ts` — 14 кейсов (сверка, дрейф значений в обе
стороны, **Keycloak впереди по флагу → дочиняем shadow**, дрейф значения → флаг из shadow, report-only, отсутствие
identity в KC, устойчивость к ошибкам починки и дочинки флага, пагинация курсором, таймер).
**Живая приёмка 16.10.2026** (на стенде, интервал 20 с): 1-й проход `scanned=6 drifted=4 healed=2 failed=0` — нашёлся
дрейф, который специально не создавали (флаги `emailVerified`), вылечен; 2-й проход `drifted=2 healed=0` —
идемпотентность; `identity_missing` (2 dev-артефакта) — вручную. Правило «флаги — объединение» добавлено по ревью
координатора (условие 1); порядок включения на проде (первый прогон report-only) — `DEPLOYMENT.md` §7 п.13.

**Долги (после Auth v1):** админский путь восстановления для passwordless-тупика (I4) — **решение владельца 16.10.2026:
отложено целиком** (кейса ещё не было, режим dev-only, ADR-0017 §7 прямо говорит «0017 не блокирует»). Вернёмся, когда
поддержка столкнётся с реальным пользователем; тогда — либо runbook через Keycloak Admin Console с включённым
`adminEventsEnabled` (+ наш структурный лог), либо админский эндпоинт. Остальное закрыто:
drift-детектор — реализован (см. блок выше), канал доставки OTP-кода на email — ADR-0019, ссылка на вопрос координатору —
`docs/auth/sessions/njs-server/questions/email-otp.md`.
**Контракт v1.4 — «выход на всех устройствах» — ✅ реализовано (16.10.2026):** предложение принято координатором
целиком (`docs/contract-proposals/auth-v1.4-logout-all.md`), контракт поднят до **v1.4** (зеркало перекопировано
целиком, `sha256 = 158ef7a8…` совпал).
- [x] `POST /users/me/logout-all` — protected, без тела → `204`: гасит все сессии Keycloak **и** ставит метку отзыва
  по `sub` (тот же `RevokeUserAccessUseCase`, `reason='logout-everywhere'`); текущий токен умирает тоже; **без
  `X-Reauth-Token`** (операция защитная, reauth дал бы тупик passwordless-пользователям — I4); идемпотентно; отказ
  инфраструктуры → `503` без нового кода; `POST /auth/sign-out` не меняется; ADR-0018 уточнён.
  Тесты: `test/application/auth/logout-all.use-case.spec.ts` (3), `test/interfaces/account-security.logout-all.spec.ts` (2).
  **Живая приёмка 16.10.2026** (стек, отдельный тестовый пользователь; два независимых входа = «два устройства»):
  `GET /users/me` (A) → `200`; `POST /users/me/logout-all` (A) → **`204`**; старым A → **`401`**; токеном B (другое
  устройство) → **`401`**; `POST /auth/refresh` с refresh B → **`401`**; свежий вход → `logout-all` → `204` (повтор);
  свежий вход **после** отзыва → `200` (пользователь не залочен). В логах —
  `access revoked (logout-everywhere) for kc=…` ✓. Нюанс, подтверждённый отдельно: токен, выданный **в ту же секунду**,
  что и отзыв, остаётся живым (`200`) — строгое `iat < revokedAt` (ADR-0018 C2); с паузой 3 с тот же сценарий даёт `401`.
  Тестовый пользователь удалён и в Keycloak, и в shadow (чтобы не плодить `identity_missing` у детектора).
  **Решение координатора (16.10.2026):** живой прогон `503` (Keycloak недоступен) — **не нужен**: этот патч не трогал
  `RevokeUserAccessUseCase` и фильтры исключений, а проброс зафиксирован юнитом (`logout-all.use-case.spec.ts:29-37`);
  `503` ведёт себя как в уже принятых сценариях отзыва (смена пароля, админские операции). Приёмка зачтена «7 из 7».

**Прогресс реализации трио — закрыто полностью (16.10.2026):** доменный метод `User.applyVerifiedContactChange` →
shared-порты `OTP_CHALLENGES` / `USER_CONTACTS` / `CONTACT_CHANGE_NOTIFIER` → `changeToken`-стор в Redis →
use-case'ы `request` / `verify` / `cancel` → HTTP-слой → живая приёмка (см. блоки acceptance ниже).
Phase 4 на бэкенде закрыта; незакрытым по ADR-0017 остаётся только долг «drift-детектор KC ↔ shadow».

## Email-канал (ADR-0019, решение E1 — DashaMail HTTP)

- [x] `EMAIL_SENDER` + `ConsoleEmailSender` (dev/CI, код в лог) + **fail-closed `503`** в проде без ключа
      (поведение как у `ConsolePhoneCallProvider`); тесты `test/infrastructure/console-email.sender.spec.ts`
- [x] адаптер `DashaMailEmailSender`: **свой `message_id`**, **`X-Dashamail-Unsub-Ignore: 1`**, таймаут 5 с и 3 попытки
      на сеть/5xx (4xx без ретрая), маппинг отказов провайдера (`code 34` — домен не подтверждён, `673` — отписка)
      в `provider-error`; адрес получателя в логи не пишем (`maskEmail`); тесты `dashamail-email.sender.spec.ts`
- [ ] **прод (отложено: прод пока не выкатываем, работаем dev-локально — решение владельца 16.10.2026):** домен отправителя подтверждён (DKIM + SPF), `DASHAMAIL_API_KEY`, webhook минимум на `Bounced`/`dropped`
      (последний статус хранить по своему `message_id`)
- [ ] realm SMTP Keycloak → DashaMail SMTP — **тоже прод** (проверить их SMTP-API: тогда один провайдер, один
      DKIM-домен, один прод-пункт); в dev реалм шлёт на Mailpit (см. блок ниже)
- [x] **dev-стенд (актуальный режим работы, 16.10.2026):** письма **Keycloak** (ссылка `VERIFY_EMAIL`) уходят на
      **Mailpit** — реалм настроен на `mailpit:1025`. Mailpit в `docker-compose.yml` объявлен **под профилем `mail`**
      (`docker-compose.yml:51`), поэтому обычный `docker compose up -d` его **не поднимает**: нужен
      `docker compose --profile mail up -d` (или точечно `docker compose up -d mailpit`); UI — `http://localhost:8025`.
      Без него живой сценарий «регистрация → клик по ссылке → active» не пройти (письмо теряется, хотя API отвечает).
      Наши каналы в dev ключей не требуют: `ConsoleEmailSender` (код в лог) и dev-SMS (`[dev-sms]`); звонковый канал
      выключен (`SMSRU_CALLCHECK_ENABLED=false`). Отмечено координатору — `questions/dev-stand-mailpit.md`.
- [x] **Бизнес-роли реалма для RBAC (16.10.2026):** в реалме `app` созданы роли `admin` и `user`; для приёмки заведены
      `admin-dev@example.com` (роль `admin`) и `user-dev@example.com` (роль `user`) — пароль передан координатору
      отчётом `questions/batches-1-2-done.md` (в репозиторий не пишу). Шаги повторного подъёма — `docs/LOCAL_DEV.md`,
      раздел «Один раз: бизнес-роли реалма (для RBAC)». Роль действует после нового входа/refresh (она берётся из JWT).
- [x] **Спящие коды `ContactNotFound` / `ContactAlreadyVerified`:** замысел (Phase 4 verify-contact) сознательно не
      реализован — «уже подтверждён» в домене идемпотентен (silent no-op), «не найден» покрыт `UserNotFound` /
      `InvalidContacts`. **Решение владельца 16.10.2026: оставляем спящими** (удаление — формально ломающее изменение
      для типизированного реестра фронта, активация — смена поведения; цена нулевая). Нота координатору —
      `questions/dormant-codes-decision.md`.
- [x] ADR-0019 «Канал доставки email» (`docs/adr/0019-email-delivery-channel.md`)
- [x] подтверждён штатный путь перевыпуска кода: **`cancel` → `request`** (повторный `request` при активном change → `409
      ContactChangeAlreadyPending`); `OTP_CHALLENGES.verify` работает по `(target, purpose)`, поэтому перевыпуск челленджа
      не ломает начатый change; фронту нужен **явный шаг «отменить и начать заново»** в UI + отсчёт из `details.retryAfter`
- [x] форма запроса/ответа сверена с документацией (15.10.2026): тело — `message_id`, `from_email`, `from_name`, `to`,
      `subject`, `message` (HTML), `plain_text`; ответ — `response.msg.err_code` (`0` = принято), `data.transaction_id` =
      эхо нашего `message_id`; незнакомая форма ответа = отказ, а не ложный успех

---

## Итог по объёму

| Фаза | Эндпоинты | Ключевая инфра |
|---|---|---|
| Prereq | — | `DomainError.code` + фильтр |
| 🔴 0 | 2 | OtpModule, Redis, argon2id, SMS-абстракция |
| 🔴 1 | 2 | Keycloak event listener |
| 🟡 1.5 | 1 | — |
| 🟡 2 | 2 | механизм выдачи токенов (решение отдельно) |
| 🟡 2.5 | 2 | SMS.ru callcheck + вебхук |
| 🟢 3 | 3 | HMAC/OIDC, federated identity |
| 🟢 4 | 7 | reauth (Redis one-shot) + `logout-all` (v1.4) |
| **Итого** | **19** | |

**Фактический статус (16.10.2026):** Phase 0 ✅ · Phase 1 ✅ · Phase 1.5 ✅ · Phase 2 ✅ · Phase 2.5 ✅
(звонковый канал включается ключом `SMSRU_CALLCHECK_ENABLED`) · **Phase 4 ✅ — все семь эндпоинтов: трио
`contact-change` + `logout-all`**; **Phase 3 — вне объёма Auth v1** (решение координатора: соц-вход отложен).
Итого: **16 из 19** эндпоинтов реализованы (v1.4 добавил `logout-all`); оставшиеся 3 — Phase 3.

**Качество API-документации (16.10.2026, по пакету задач фронта):** у response-DTO не было `properties` в Swagger —
они были обычными TS-классами, а `@ApiProperty` в `src` не использовался ни разу. Перевёл **11 response-DTO** на Zod +
`createZodDto` (единый стиль с request-DTO): auth 6 (`UserDto`, `TokenPairResponseDto`, `ReauthResponseDto`,
`SignUpEmailResponseDto`, `SignUpPhoneResponseDto`, `RequestContactChangeResponseDto`), otp 4 (`OtpChallengeResponseDto`,
`OtpVerifiedResponseDto`, `PhoneCallChallengeResponseDto`, `PhoneCallStatusResponseDto` — состояние берётся из домена
через `z.enum(CALL_STATUSES)`), user 1 (`UserResponseDto`). Проверено живьём: `GET /api/v1/docs-json` отдаёт заполненные
`properties` у всех **одиннадцати** схем (включая `method` и `otpFallback`, из-за которых фронту приходилось читать код).
Конструирования DTO в коде нет (`new *Dto(` — 0), поэтому поведение не изменилось: `tsc` 0, 61 suite / 348 тестов.

**Вход при незакрытом `VERIFY_EMAIL` (проверено живьём 16.10.2026):** `POST /auth/sign-in` отвечает **`401
InvalidCredentials`** (тело — единый контрактный ответ), ответ Keycloak «Account is not fully set up» наружу не проходит
(анти-энумерация), в логе остаётся внутренняя строка `signIn failed for <email>`. Фронт строил UX на этом
предположении — оно верно.

**Порядок:** Prerequisite → Phase 0 → дальше по фазам. Phase 2.5 (обратный звонок) не блокирует Phase 2: он переиспользует её эндпоинты и тот же челлендж-стор. Phase 0 разблокирует фронтовый `entities/otp-challenge`; после smoke-проверки фронт снимает MSW-моки на `/auth/otp/*` (процедура — в `auth-roadmap.md` репозитория фронта, § «Когда уходим от MSW»).
