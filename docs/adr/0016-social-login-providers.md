# ADR 0016: Вход через соц-провайдеров — brokered OIDC в Keycloak + custom-провайдеры

- **Дата:** 2026-10-14
- **Статус:** **Proposed** — механизм рекомендуем и просим подтвердить вместе с контракт-предложением
  `docs/contract-proposals/auth-v1.3-social.md` (там же 6 открытых вопросов). После ответа координатора — Accepted.
- **Связано:** ADR-0004 (Keycloak как IdP), ADR-0015 (CIBA), чек-лист Phase 3

## Контекст

Phase 3 добавляет вход через VK ID / Yandex / Telegram плюс «попытка №1 — OIDC-провайдеры через Keycloak».
Провайдеры делятся на два класса:

- те, кого Keycloak умеет брокерить (Google/GitHub сразу; VK/Yandex — если заведётся Generic OIDC);
- те, у кого готового Keycloak-IdP нет или он не подходит (Telegram Widget — HMAC от данных виджета,
  Telegram Bot — код из переписки).

Дополнительно: у соц-пользователя может не быть ни email, ни телефона, а токены нам в любом случае нужно выдать
синхронно (контракт отвечает `{ user, tokens }`).

## Решение

### 1. Брокеренные провайдеры — authorization code + PKCE через Keycloak

- В реалме создаётся **публичный клиент для фронта** (предлагаем `app-web`; `publicClient: true`,
  `pkce.code.challenge.method: S256`, redirect URIs фронта). Сейчас его **нет**: в dev-реестре только
  `app-backend` (confidential) и служебные (`account`, `account-console`, `admin-cli`, `broker`,
  `realm-management`, `security-admin-console`).
- `GET /auth/providers` отдаёт фронту готовый дескриптор (`authorizationUrl`, `clientId`, `scopes`, `usePkce`) —
  фронт не хардкодит ни список, ни адреса.
- Фронт ведёт пользователя на authorization endpoint Keycloak; после возврата `POST /auth/oidc/callback`
  **наш бэкенд** обменивает `code` тем же публичным клиентом + `code_verifier`
  (секрета не нужно и не должно быть: PKCE + одноразовость кода + привязка к `redirectUri` дают достаточную защиту).
- Полученные токены Keycloak и есть наш ответ `{ user, tokens }` — **отдельный минт не нужен**. Shadow-пользователь
  синхронизируется как в email-flow (первый вход создаёт его).

### 2. Custom-провайдеры — проверяем доказательство сами, токены через CIBA

- Telegram Widget: `hash` = HMAC-SHA256 от data-check-string с ключом `SHA256(bot_token)`, `auth_date` ≤ 5 минут,
  порядок полей — алфавитный; Telegram Bot: одноразовая сессия в Redis + код из бота.
- VK ID / Yandex: проверка токена/подписи через API провайдера (если Generic OIDC не заработает).
- Пользователь создаётся/находится в Keycloak **нашим админ-API** (`users.create` → `addFederatedIdentity`),
  затем токены выдаются **CIBA** (ADR-0015) через уже существующий `USER_TOKEN_ISSUER`. Это второй потребитель
  механизма из ADR-0015 — отдельной инфраструктуры минта не появляется.
- Связка с shadow-пользователем — через `USER_PROVISIONING` (как в Phase 1/2), плюс храним провайдера
  и subject в самом Keycloak (federated identity) — вторым источником правды не обзаводимся.

### 3. Политика линковки — без автолинковки

Если соц-профиль приходит с email/phone, который уже используется нашим аккаунтом, **не** привязываем провайдера
автоматически: отвечаем `409 ProviderAccountLinked` / `ContactAlreadyExists` и просим войти прежним способом и
привязать провайдера явно. Автолинковка по email/phone у провайдера — классический вектор захвата аккаунта
(email у некоторых провайдеров не подтверждён).

## Проверено на живом стеке (14.10.2026, dev-реестр `app`)

```
GET /admin/realms/app/identity-provider/instances → []            ← ни одного IdP не настроено
GET /admin/realms/app/clients → account, account-console, admin-cli, app-backend,
                                broker, realm-management, security-admin-console
                                ← браузерного клиента для фронта нет
```

Следствие: предусловия Phase 3 — (а) создать публичный клиент `app-web` с PKCE и redirect URIs фронта,
(б) настроить IdP в реалме (для dev достаточно Google/GitHub), (в) проверить, заводится ли VK/Yandex как Generic OIDC.
Эти три пункта — инфраструктурная часть Phase 3, кода не требуют.

## Последствия

- Новых механизмов выдачи токенов не появляется: либо токены Keycloak «как есть» (брокеренный путь), либо CIBA.
- Фронт не знает про Keycloak: только `GET /auth/providers` + callback-эндпоинт.
- Появляется публичный клиент `app-web` — его нужно завести в обоих контурах (dev/прод) и в деплой-гайде.
- `needsContactCompletion` (профиль без контактов) остаётся на уровне «обычные токены + UI просит заполнить»
  до ответа координатора (вопрос №3 предложения).

## Альтернативы

| Вариант | Почему нет |
| --- | --- |
| Всё через Keycloak, включая Telegram | Готового IdP для Telegram Widget (HMAC) в Keycloak нет; Bot-flow — тоже своё |
| Всё своими руками, без Keycloak | Теряем federated identity и брокеринг, который Keycloak уже умеет; дублируем состояние аккаунтов |
| Брокеренный путь тоже через CIBA | Лишний шаг: токены уже получены обменом кода |

## Ссылки

- `docs/contract-proposals/auth-v1.3-social.md` — форма эндпоинтов, коды, открытые вопросы
- `docs/adr/0015-ciba-token-minting.md` — минт для custom-провайдеров
- `docs/auth-suite-backend-checklist.md` § Phase 3
