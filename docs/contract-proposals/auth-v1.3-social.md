# Предложение к контракту Auth v1.x: v1.2 → v1.3 (вход через соц-провайдеров, Phase 3)

- **Класс изменения:** аддитивное по эндпоинтам (3 новых) **+ 2 новых кода в реестр** → `v1.2 → v1.3` по таблице контракта
- **Запрашивает:** backend-сессия (`njs-server`), 2026-10-14
- **Статус:** **Proposed** — ждём решения координатора (выбор провайдеров MVP, политика линковки аккаунтов, форма `ProviderDescriptor`)
- **Ломает ли фронт:** нет. Инвариант «клиент не ломается на неизвестном коде» (`matchError` → `false`) сохраняется; однако
  типизированный `ERROR_MESSAGES: Record<ErrorCode, string>` — это компиляторный гардрейл, поэтому фронту нужно добавить
  два сообщения (и получить из контракта сами имена кодов)

## Зачем

Phase 3 чек-листа: вход через VK ID / Yandex / Telegram (+ OIDC-провайдеры Keycloak как «попытка №1»). Отличия от
Phase 0–2.5 принципиальные:

1. Доказательство владения контактом приходит **не от нас** (провайдер), поэтому верификация — это проверка
   подписи/токена провайдера, а не OTP-челлендж (`verificationToken` тут не участвует).
2. У социального пользователя может **не быть** ни email, ни телефона → нужен ответ «профиль неполный».
3. Часть провайдеров идёт **через Keycloak** (federated identity), часть — **мимо** (Telegram Widget/Bot, VK ID).
   Это решает способ выдачи токенов: см. § «Как выдаются токены».

Что **не меняется**: `TokenPair`, `UserDto`, семантика «первый вход создаёт shadow-пользователя», anti-enumeration,
формат `error`-поля (`DomainError.code`).

## Как выдаются токены (важно для ревью)

- **Keycloak-brokered путь** (`GET /auth/providers` + `POST /auth/oidc/callback`): фронт идёт на authorization endpoint
  Keycloak с PKCE, получает `code`, отдаёт его нам; **мы** обмениваем `code` на токены у Keycloak (client secret наш)
  и возвращаем `{ user, tokens }`. Отдельный минт не нужен — токены уже выдал Keycloak.
- **Custom путь** (`POST /auth/providers/:id/callback`): Keycloak не участвует, социальное доказательство проверяем сами
  (HMAC/API провайдера) → пользователя в Keycloak создаём админ-API → **токены выдаём через CIBA** (ADR-0015).
  Это второй потребитель механизма ADR-0015 после phone-регистрации/входа.

## Что добавляется

### 1. `GET /auth/providers` — public

```ts
200 → ProviderDescriptor[]

type ProviderDescriptor = {
  id: 'keycloak-oidc' | 'telegram-widget' | 'telegram-bot' | 'vkid' | 'yandex',
  kind: 'oidc' | 'custom',
  title: string,              // для кнопки на UI: «ВКонтакте», «Telegram», …
  enabled: boolean,           // конфигурируется на бэке; UI рисует только enabled
  // только для kind='oidc' — то, что фронт кладёт в redirect:
  authorizationUrl?: string,
  clientId?: string,
  scopes?: string[],
  usePkce?: boolean,
}
```

Смысл: фронт не хардкодит список провайдеров и не знает про Keycloak — только «куда вести пользователя».
Пустой массив — валидный ответ (провайдеры не настроены).

### 2. `POST /auth/oidc/callback` — public

```ts
body: { code, state, codeVerifier, redirectUri }   // PKCE authorization-code flow Keycloak

201 → { user /* UserDto */, tokens /* TokenPair */, needsContactCompletion?: true }
422 SocialAuthFailed        // обмен code не прошёл / провайдер вернул отказ / state не совпал
409 ProviderAccountLinked   // эта federated identity уже привязана к другому аккаунту (см. вопрос №2)
```

`state` проверяем на бэке (одноразовый, Redis, TTL 10 мин) — **открытый вопрос №1: кто его генерирует**
(фронт или бэк вместе с `GET /auth/providers`).

### 3. `POST /auth/providers/:id/callback` — public

```ts
:id ∈ 'telegram-widget' | 'telegram-bot' | 'vkid' | 'yandex'

// telegram-widget: данные виджета приходят на фронт, он отдаёт их нам как есть
body: { id, first_name, last_name?, username?, photo_url?, auth_date, hash }

// telegram-bot: двухшаговая схема
body: { loginSessionId }                 // шаг 1 — см. вопрос №1 (кто создаёт сессию)
body: { loginSessionId, code }           // шаг 2 — пользователь ввёл код из бота

// vkid / yandex: что именно шлёт фронт, зависит от их JS-SDK — открытый вопрос №4
body: { accessToken /* или code + codeVerifier */, ... }

201 → { user, tokens }   |   { user, tokens, needsContactCompletion: true }
422 SocialAuthFailed
```

Требования к проверке (для ревью реализации):

- **telegram-widget:** `hash` = HMAC-SHA256 от data-check-string, ключ — `SHA256(bot_token)`; `auth_date` не старше
  5 минут; порядок полей — алфавитный, как в протоколе Telegram.
- **telegram-bot:** бот получает `/start <loginSessionId>`, сессия в Redis (TTL 5 мин, одноразовая), код берём из
  сообщения бота (polling/webhook), сверяем и гасим сессию.
- **vkid/yandex:** проверяем токен/подпись через API провайдера либо OIDC-верификацию, если провайдер её даёт.

### Коды для реестра (просим внести в контракт)

| Код | HTTP | Когда |
|---|---|---|
| `SocialAuthFailed` ⟵ *v1.3* | 422 | доказательство провайдера не прошло проверку (просроченный `auth_date`, битая подпись, отказ обмена `code`) |
| `ProviderAccountLinked` ⟵ *v1.3* | 409 | federated identity уже привязана к другому нашему аккаунту |

Оба кода **уже есть** в реестре бэкенда (`src/shared/domain/errors/error-code.ts`, блок «Social / federated»), но в
контракт ещё не внесены — поэтому фронт про них пока не знает. Других новых кодов не просим: ошибки конфигурации
(провайдер выключен, Keycloak недоступен) отдаём как `422 SocialAuthFailed` / `503`.

## Открытые вопросы к координатору

1. **Кто генерирует `state` и `codeVerifier`.** Спайк прояснил механику: PKCE-verifier живёт у инициатора флоу, то
   есть у фронта, а сверять `state` с «нашим» значением бэкенд может только если мы сами его выдаём.
   **Предложение бэкенда:** `state` и PKCE — фронтовые, а доказательство для нас — сам успешный обмен кода (токены
   приходят только при валидном `code` + `code_verifier`). Тогда `loginSessionId` не нужен, а тело
   `POST /auth/oidc/callback` остаётся как в §2.
2. **Политика линковки (security-вопрос).** Если соц-профиль приходит с email/phone, который уже есть у нашего
   пользователя: (а) автоматически привязываем провайдера к нему — удобно, но это классический вектор захвата
   аккаунта при непроверенном email у провайдера; (б) отвечаем `409 ProviderAccountLinked`/`ContactAlreadyExists`
   и просим войти прежним способом и привязать провайдера явно. **Рекомендация бэкенда: (б)**.
3. **`needsContactCompletion`:** что может такой пользователь до заполнения контакта? (а) обычные токены, UI сам
   требует заполнить; (б) токены с урезанным scope (только `/users/me` + привязка контакта) — тогда в контракт
   добавляются scopes. **Рекомендация бэкенда: (а) на MVP.**
4. **Форма данных от VK ID / Yandex SDK** (какой токен/`code` доходит до фронта) — до реализации этих провайдеров.
   Telegram Widget/Bot и Keycloak-OIDC уже понятны.
5. **Состав MVP.** Порядок, который предлагает бэкенд: Keycloak-OIDC (Google/GitHub — для dev) → Telegram Widget →
   Telegram Bot → VK ID → Yandex.
6. **Нужен ли эндпоинт привязки провайдера к существующему аккаунту** (`POST /users/me/providers`)? В чек-листе это
   отнесено к Account Console; если нужен свой — отдельное предложение.
7. **«Review Profile» в Keycloak.** В стоковом flow `first broker login` этот шаг обязателен, поэтому **каждый
   первый** brokered-вход показывает пользователю «обновите профиль» — даже когда провайдер отдал имя/email
   (проверено спайком). Варианты: (а) выключаем шаг и импортируем молча (dev-стенд так и настроен); (б) оставляем
   как явное подтверждение профиля. **Рекомендация бэкенда:** (а) + `needsContactCompletion` для пустых контактов.

## Как применять (для координатора)

1. Ответить на вопросы 1–3 и 5 (без них реализация упрётся в догадки).
2. Внести в `docs/auth-v1-contract.md`: 3 эндпоинта + 2 кода + решить вопрос 3 (scopes).
3. Поднять версию до **v1.3**, выдать задачу обеим сессиям (фронт: `ERROR_MESSAGES` + кнопки провайдеров; бэкенд:
   ADR по механизму + реализация).

## Ссылки

- `docs/auth-suite-backend-checklist.md` § Phase 3 — исходный список эндпоинтов и кодов
- `docs/adr/0015-ciba-token-minting.md` — выдача токенов без браузера (нужна custom-провайдерам)
- `docs/adr/0004-keycloak-as-identity-provider.md`
- `docs/contract-proposals/auth-v1.2-phone-call-verification.md` — формат предложения и пример рассмотрения

## Итог рассмотрения координатором (15.10.2026)

Контракт поднят до **v1.3**. Принято:

- 3 эндпоинта; в `POST /auth/providers/:id/callback` на MVP только `:id = 'telegram-widget'`,
  `telegram-bot` / `vkid` / `yandex` **зарезервированы** и добавляются отдельными предложениями;
- коды `SocialAuthFailed` (422) и `ProviderAccountLinked` (409) внесены в реестр контракта;
- **вопрос №2 (линковка):** автопривязка провайдера по совпавшему контакту **запрещена** → `409 ProviderAccountLinked`
  (identity уже привязана) либо `409 ContactAlreadyExists` (контакт занят другим аккаунтом); своего эндпоинта привязки
  в v1.3 нет — пользователь входит прежним способом;
- **вопрос №3 (`needsContactCompletion`):** обычные токены + флаг, **статус аккаунта `pending_verification`**
  (фронт отталкивается от существующего `/system/account-status`); новые scopes **не вводятся**;
- **вопрос №1 (`state`/PKCE):** `codeVerifier` и `state` — **клиентские**; фронт обязан сверить `state` со своим
  сохранённым значением **до** вызова `POST /auth/oidc/callback`; доказательство для бэкенда — успешный обмен `code`;
- **вопрос №7 (Review Profile):** отдельного пункта в контракте нет — решается вручную при настройке реалма
  (dev-стенд: экзекуция `Review Profile` выключена);
- **реализация выведена за скоуп Auth v1** (решение владельца): эндпоинты заморожены, но в `njs-server` не реализуются.

Статус предложения: **Accepted** (сужено против исходного текста — см. пункты выше).
