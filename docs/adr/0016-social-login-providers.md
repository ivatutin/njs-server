# ADR 0016: Вход через соц-провайдеров — brokered OIDC в Keycloak + custom-провайдеры

- **Дата:** 2026-10-14
- **Статус:** **Accepted** (бэкенд-часть): механизм подтверждён живым спайком, см. раздел «Спайк на живом стеке»
  и `docs/research/social-login-broker-spike.md`. Форма контракта — на рассмотрении координатора
  (`docs/contract-proposals/auth-v1.3-social.md`).
- **Скоуп (обновлено 15.10.2026):** контракт **v1.3** заморозил эндпоинты (в MVP — `telegram-widget`), но
  **реализация соц-входа выведена за скоуп Auth v1** (решение владельца). Этот ADR фиксирует выбранный механизм,
  решения по линковке и результаты спайка; кода по нему в `njs-server` пока нет.
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

## Спайк на живом стеке (14.10.2026, Keycloak 26.8.0)

Стенд поднят **без внешних провайдеров**: stub-OIDC, ходящий сам на себя (реалм `idp-stub`), публичный клиент
`app-web` с PKCE `S256`, IdP `stub` в реалме `app`. Разбор целиком — `docs/research/social-login-broker-spike.md`.

**Результат: механизм подтверждён end-to-end.** Цепочка из 6 хопов (`/auth` → broker login → логин IdP → broker
endpoint → `first-broker-login` → наш `redirect_uri` с кодом) завершилась обменом кода
`grant_type=authorization_code&client_id=app-web&code_verifier=…` **без `client_secret`** → `access_token` +
`refresh_token` + `id_token`, `expires_in: 300`. Значит тела `POST /auth/oidc/callback` достаточно, и секрет в
брокеренном пути не нужен.

Что ещё подтвердилось:

- пользователь в реалме создаётся автоматически (`syncMode=IMPORT`), email приходит подтверждённым (`trustEmail`),
  `firstName`/`lastName` мапятся из профиля IdP → shadow-БД заполняется тем же способом, что в email-flow;
- запись federated identity (`identityProvider` + `userId` = subject провайдера) — **та же структура**, которую для
  custom-пути создаёт `addFederatedIdentity`; дублировать её в своей БД не нужно;
- повторный вход отдаёт код сразу (SSO) и попадает в **того же** пользователя — второй аккаунт не создаётся.

Обнаруженные при спайке ограничения (подробно — в разборе):

1. **Split-horizon для IdP:** `authorizationUrl` и `issuer` — публичные (`http://localhost:8088/…`, их видит
   браузер), а `tokenUrl`/`userInfoUrl`/`jwksUrl` — внутренние (`http://keycloak:8080/…`, их зовёт контейнер).
   Первая попытка упала `Connect to localhost:8088 → Connection refused` — та же ловушка, что в ADR-0013.
2. **Review Profile** в стоковом `first broker login` показывается на **каждом** первом brokered-входе; в dev-стенде
   экзекуция выключена. Оставлять ли этот шаг как UX — вопрос продукта (вопрос №7 предложения v1.3).
3. Клиент, созданный через Admin API, **игнорирует переданный `secret`** (Keycloak генерирует свой) — реальное
   значение только из `GET …/clients/{id}/client-secret`.

Исходное состояние контура (для истории): на момент начала Phase 3 в реалме `app` было **0 identity providers** и
**не было браузерного клиента** — только `app-backend` (confidential) и служебные (`account`, `account-console`,
`admin-cli`, `broker`, `realm-management`, `security-admin-console`). Спайк добавил в dev `app-web` + IdP `stub`;
в проде вместо stub нужны реальные провайдеры и redirect URI фронта.

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

## Решение координатора по предложению v1.3 (15.10.2026)

Чтобы ADR был самодостаточным (полный текст — `video-service/docs/handoff/decision-v1.3-social.md`):

| Вопрос | Решение |
| --- | --- |
| Q1 `state` / PKCE | клиентские (принято предложение бэкенда); фронт сверяет `state` **до** вызова `POST /auth/oidc/callback` — именно это блокирует login-CSRF |
| Q2 линковка | вариант (б): **автопривязка запрещена** → `409 ProviderAccountLinked` (identity занята) / `409 ContactAlreadyExists` (контакт занят) |
| Q3 неполный профиль | обычные токены + `needsContactCompletion`, **статус аккаунта `pending_verification`**; новые scopes не вводятся |
| Q4 VK ID / Yandex | не фризим: сначала нужен спайк по формам данных их SDK |
| Q5 состав MVP | **Keycloak-OIDC + Telegram Widget**; `telegram-bot` (нужен `POST /auth/providers/:id/start`), VK ID, Yandex — отдельными предложениями |
| Q6 эндпоинт привязки | не нужен: редкий случай закрывает Keycloak Account Console |
| Q7 Review Profile | вариант (а): **шаг отключаем** — пользователь не должен попадать на брендированную страницу Keycloak; профиль импортируется молча, неполноту закрывают `needsContactCompletion` и `pending_verification`. Это конфиг realm, поэтому фиксируется здесь |
| Скоуп | реализация — **вне Auth v1**, по решению владельца |

Следствие для конфигурации (шаг в DEPLOYMENT §7): экзекуция `Review Profile` в flow `first broker login` выключается.

## Ссылки

- `docs/contract-proposals/auth-v1.3-social.md` — форма эндпоинтов, коды, открытые вопросы
- `docs/adr/0015-ciba-token-minting.md` — минт для custom-провайдеров
- `docs/auth-suite-backend-checklist.md` § Phase 3
