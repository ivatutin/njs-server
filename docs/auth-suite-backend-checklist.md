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

**Осталось вне этого репозитория:** фронт снимает MSW-мок с `/auth/otp/*` (процедура — в `auth-roadmap.md` § «Когда уходим от MSW»).

---

## ⚠️ Разобраться: placeholder verify-эндпоинты

`POST /users/:id/email/verify` и `POST /users/:id/phone/verify` — по `:id`, код **не валидируют** (в JSDoc помечено placeholder). Контракт ждёт self-service `/auth/otp/*`. Фронт их не использует.

- [ ] решить: выпилить, или оставить как админский тумблер (тогда задокументировать, что это admin-only и вне auth-suite)

---

## 🔴 Phase 1 — Email-регистрация (Keycloak magic link)

- [ ] `POST /auth/sign-up/email` — public
  - body: `{ email, password, acceptedTerms: true, firstName?, lastName? }`
  - 201 → `{ user: UserDto /* status: pending_verification */, verifyEmailSent: true }`
  - Keycloak: `users.create({ email, credentials: [{ type:'password', value }], emailVerified: false, requiredActions: ['VERIFY_EMAIL'] })` + `users.sendVerifyEmail(id)`
  - `409 ContactAlreadyExists` · `422 PasswordPolicyViolation` (+`details.message`) · `422 TermsNotAccepted`

- [ ] `POST /auth/verify-email/resend` — public
  - body: `{ email }` → `202` **всегда** (anti-enum)

**Инфра:**
- [ ] `KeycloakEventListenerService` ловит `VERIFY_EMAIL` event → обновляет Postgres shadow user (`emailVerified=true`, `status=active`)
- фронт на `/auth/verify-email` поллит `GET /users/me` каждые 5 c

**Коды:** `ContactAlreadyExists`, `PasswordPolicyViolation`, `TermsNotAccepted`.

---

## 🟡 Phase 1.5 — Забыл пароль

- [ ] `POST /auth/forgot-password` — public
  - body: `{ email }` → `202` **всегда** (anti-enum)
  - Keycloak: `users.executeActionsEmail(id, ['UPDATE_PASSWORD'], { lifespan: 3600 })`
  - rate-limit 3/час per email

---

## 🟡 Phase 2 — Phone-регистрация и вход

Требует Phase 0 (verificationToken) + Token Exchange в Keycloak.

- [ ] `POST /auth/sign-up/phone` — public
  - body: `{ phone /* E.164 */, verificationToken, acceptedTerms: true, firstName?, lastName? }`
  - 201 → `{ user, tokens }`
  - Keycloak: passwordless `users.create({ username: uuid(), attributes: { phoneNumber: [phone], phoneVerified: ['true'] }, credentials: [] })`, status `active`, auto-login через Token Exchange
  - `422 VerificationTokenInvalid` / `VerificationTokenExpired` · `409 ContactAlreadyExists`

- [ ] `POST /auth/sign-in/phone` — public
  - body: `{ phone, verificationToken /* purpose='sign-in' */ }`
  - 200 → `TokenPair`
  - lookup по attribute `phoneNumber` → нет → `401 InvalidCredentials` (**тот же ответ**, что при wrong OTP — anti-enum) → иначе Token Exchange

**Инфра:**
- [ ] Token Exchange (RFC 8693) включён в Keycloak; service account с `realm-management/manage-users`
- [ ] lookup user по `phoneNumber` attribute (индекс в Postgres shadow)

**Коды:** `VerificationTokenInvalid`, `VerificationTokenExpired`, `ContactAlreadyExists`, `InvalidCredentials`.

---

## 🟢 Phase 3 — Social (VK ID / Yandex / Telegram)

- [ ] `GET /auth/providers` → `ProviderDescriptor[]`
- [ ] `POST /auth/oidc/callback` — `{ code, state, codeVerifier, redirectUri }` → `{ user, tokens, needsContactCompletion? }` (Keycloak-brokered: Google/GitHub/VK/Yandex если Generic OIDC заведётся)
- [ ] `POST /auth/providers/:id/callback` — custom flows, `:id ∈ telegram-widget | telegram-bot | vkid | yandex`
  - Telegram Widget: validate HMAC SHA256 → `users.create` + `addFederatedIdentity`
  - Telegram Bot: сессии в Redis, OTP
  - VK/Yandex fallback: validate через provider API + `addFederatedIdentity`
- `needsContactCompletion: true` если у user нет ни email, ни phone
- **Коды:** `SocialAuthFailed`, `ProviderAccountLinked`

Попытка №1 — Generic OIDC в Keycloak; custom-эндпоинты — fallback (см. risk register в auth-roadmap).

---

## 🟢 Phase 4 — Безопасность аккаунта

Требует Phase 0 (OTP) + reauth-инфру.

- [ ] `POST /auth/reauth` — protected — `{ password }` → `{ reauthToken, expiresAt }` (one-shot, ~5 мин, в Redis)
- [ ] `POST /users/me/contact-change/request` — protected + `X-Reauth-Token` — `{ channel: 'email'|'phone', newValue }` → `201 { changeToken, requiresOldChallenge, oldChallengeId?, newChallengeId }`
- [ ] `POST /users/me/contact-change/verify` — protected — `{ changeToken, oldCode?, newCode }` → `200 UserDto`
- [ ] `POST /users/me/contact-change/cancel` — protected — `{ changeToken }` → `204`
- [ ] `POST /users/me/password` — protected + `X-Reauth-Token` — `{ newPassword }` → `204`
- [ ] `POST /users/me/set-password` — protected — `{ verificationToken /* purpose='set-password' */, newPassword }` → `204`

**Коды:** `ReauthTokenInvalid`, `ReauthTokenExpired`, `ChangeTokenExpired`, `ContactAlreadyExists`, `ContactChangeAlreadyPending`, `PasswordPolicyViolation`, `OtpInvalid`, `OtpExpired`.

Advanced-операции (сессии, отвязка провайдеров, удаление аккаунта, MFA) — нативный Keycloak Account Console, не наши эндпоинты.

---

## Итог по объёму

| Фаза | Эндпоинты | Ключевая инфра |
|---|---|---|
| Prereq | — | `DomainError.code` + фильтр |
| 🔴 0 | 2 | OtpModule, Redis, argon2id, SMS-абстракция |
| 🔴 1 | 2 | Keycloak event listener |
| 🟡 1.5 | 1 | — |
| 🟡 2 | 2 | Token Exchange |
| 🟢 3 | 3 | HMAC/OIDC, federated identity |
| 🟢 4 | 6 | reauth (Redis one-shot) |
| **Итого** | **16** | |

**Порядок:** Prerequisite → Phase 0 → дальше по фазам. Phase 0 разблокирует фронтовый `entities/otp-challenge`; после smoke-проверки фронт снимает MSW-моки на `/auth/otp/*` (процедура — в auth-roadmap § «Когда уходим от MSW»).
