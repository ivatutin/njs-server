# ADR 0017: Смена контакта (email/phone) — синхронизация Keycloak и shadow-БД

- **Дата:** 2026-10-15 (ред. 2 — после ревью координатора)
- **Статус:** **Accepted с условиями.** Механизм подтверждён, но **реализация не начинается** до: (B1) решения по политике
  `username` и (B2) проектирования обработки частичного сбоя. (B3) вынесен в **ADR-0018** (отзыв access-токенов).
- **Связано:** ADR-0004 (Keycloak), ADR-0015 (CIBA, `username` = контакт), ADR-0011 (OTP-хранилище),
  ADR-0018 (отзыв токенов), чек-лист Phase 4

## Контекст

Phase 4 добавляет смену контакта (`contact-change/request|verify|cancel`; коды `ChangeTokenExpired`,
`ContactChangeAlreadyPending`, `ContactAlreadyExists`, `OtpInvalid`, `OtpExpired` — уже в реестре контракта v1.3).

Контакт живёт **в двух хранилищах** с разными ролями:

| Где | Что | Зачем |
| --- | --- | --- |
| Keycloak | `username` (у email-пользователя = email, у phone = телефон, ADR-0015), `email`, `emailVerified`, атрибуты `phoneNumber`/`phoneVerified` | вход (password grant, CIBA-`login_hint`), письма, Account Console |
| shadow-БД (`User`) | `email`, `phone` (`@unique`), `*_verified_at`, статус | источник правды для lookup, anti-enumeration, бизнес-логика |

В `User` есть инвариант: verified-контакт нельзя менять напрямую (422 `InvalidContacts`) — смена идёт санкционированным
путём через подтверждение кодами.

## Что показали живые проверки (15.10.2026, Keycloak 26.8.0)

| Проверка | Факт |
| --- | --- |
| Флаги реалма | `editUsernameAllowed=false`, `loginWithEmailAllowed=true`, `duplicateEmailsAllowed=false` |
| Админ-переименование при текущем конфиге | `400 error-user-attribute-read-only` (даже при `username.permissions.edit=['admin','user']`) |
| Переименование при `editUsernameAllowed=true` + `permissions.edit=['admin']` | **204** ✓, затем password-grant по **новому** логину → `300` ✓ (проверено и откатано) |
| Логин по email, когда `username` — не email | password-grant по email → `300` ✓ (KC резолвит по атрибуту `email`) |
| Коллизия email при создании | `409 User exists with same email` ✓ (KC проверяет) |
| Коллизия телефона (атрибут) | `201` ✓ — **KC уникальность телефона не проверяет**, её держит наша БД |
| Access-токен после `logout` | `/users/me` → `200` (жив), refresh → `401` ⇒ **B3 подтверждён фактом** |

## Решение

### 1. Политика `username` (B1)

- **Смена email переименования не требует** — проверено: и password-grant, и CIBA-резолвер (`findUserByNameOrEmail`)
  находят пользователя по атрибуту `email`.
- **Смена телефона требует нового `username`**, потому что у phone-пользователя логин = телефон (ADR-0015) —
  иначе CIBA-`login_hint` перестанет его находить.
- Два пути, **нужно решение координатора/владельца** (реализация не начинается до выбора):

  | Путь | Что нужно | Плюсы / минусы |
  | --- | --- | --- |
  | **(A) Разрешить переименование** | realm `editUsernameAllowed=true` + профиль `username.permissions.edit=['admin']` (чтобы пользователь себя не переименовывал) | проверено живьём (204 + вход по новому логину ✓); инвариант «логин = текущий контакт» сохраняется. Минус: меняется схема реалма (2 настройки) |
  | **(B) Стабильный handle** (рекомендация бэкенда) | без изменений реалма: `username` фиксируется при создании и не меняется; для CIBA и password-grant берём `username` из админ-API (в reauth уже так), а текущий контакт живёт в shadow-БД | реалм не трогаем, риск ниже. Минус: логин в Account Console выглядит устаревшим и содержит старый контакт |

- В обоих путях переименовываем/используем логин **только когда меняется контакт, равный текущему `username`**.

### 2. Поток (с TOCTOU-резервом и перевыпуском челленджа)

```
POST /users/me/contact-change/request    protected + X-Reauth-Token
  → проверка занятости нового контакта (409 ContactAlreadyExists)
  → один активный change на пользователя, иначе 409 ContactChangeAlreadyPending
  → РЕЗЕРВ нового контакта (Redis, TTL = TTL change) — против TOCTOU
  → челленджи: new всегда (purpose='change-contact-new'), old — по правилу I2
  → 201 { changeToken, requiresOldChallenge, oldChallengeId?, newChallengeId }

POST /users/me/contact-change/verify      protected   { changeToken, oldCode?, newCode }
  → ре-чек занятости в той же транзакции, что и запись в shadow — конфликт → 409
  → проверка кодов: OTP_CHALLENGES.verify({ target, purpose, code })
    (по target+purpose, а не по id — тогда перевыпуск челленджа через /auth/otp/send не ломает change)
  → shadow-БД (транзакция) → Keycloak (username/email/attributes/emailVerified)
  → гасим сессии KC + отзываем access-токены (ADR-0018)
  → 200 UserDto

POST /users/me/contact-change/cancel      protected   { changeToken } → 204 (снимает резерв и челленджи)
```

TTL `changeToken` — **10 минут** (уравнено с `verificationToken`, ответ координатора №3); челлендж внутри одного change
можно перевыпускать, не начиная change заново.

### 3. Частичный сбой Keycloak ↔ shadow (B2)

- Порядок: **shadow-БД (транзакция) → Keycloak** — уникальность телефона держим мы (KC атрибут не проверяет).
- Ре-чек занятости — **в той же транзакции**, что и запись (закрывает TOCTOU между `request` и `verify`).
- Операция **идемпотентна по конечному состоянию** (повторная запись того же контакта — no-op); внутри `verify` — ретраи KC;
  при исчерпании: компенсация (откат shadow, best-effort) + статус `failed` в записи change + признак
  `contact_change_failed` в логе + **алерт**.
- Повторный `verify` по тому же `changeToken` отвечает по состоянию записи: `applied` → 200 (идемпотентно),
  `failed` → 5xx без повторного применения.
- **Drift-детектор** (сверка KC ↔ shadow по контактам) — отдельной задачей.

### 4. Сессии и access-токены (B3)

После успешной смены: гасим сессии KC (`POST /users/{id}/logout`) **и отзываем уже выданные access-токены** по
механизму **ADR-0018** — иначе токен живёт до `exp` (подтверждено фактом: `/users/me` отвечал 200 после logout).
То же нужно для смены пароля (`/users/me/password`) и `set-password` — общее решение в ADR-0018.

### 5. `changeToken`

TTL 10 минут, Redis, хранится **хешем**, привязан к `keycloakId`, **не одноразовый** (нужен `verify` и `cancel`),
один активный change на пользователя.

### 6. Уведомления и подтверждения

- **I2 (кому уходит oldChallenge):** на **заменяемый** контакт, если он verified; иначе — на другой verified контакт;
  если verified-контактов нет — `requiresOldChallenge=false`.
- **I1 (уведомления):** после успешной смены уведомляем **и старый, и новый** контакт (SMS/email) — дешёвый контроль
  против незаметного угона. Подтверждение старого контакта при смене **email обязательно** (ответ координатора №2):
  иначе украденный пароль превращается в постоянный захват аккаунта.

### 7. Детали, зафиксированные на ревью

- **I6:** после смены вызываем только `activateIfPending()` — suspended не «оживает» молча.
- **I7:** нормализация до проверки уникальности (email → lowercase, телефон → E.164); контакты в логи не пишем (**PII**).
- **I8:** лимиты per-target (ADR-0011) **+ лимит на пользователя** — код/деньги уходят на новый, потенциально чужой контакт.
- **I9:** после `verify` пользователь разлогинен (логин изменился) — обязанность фронта уже передана координатором.
- **I4 (тупик для passwordless):** начать change такой пользователь не может (нужен `X-Reauth-Token`, пароля нет),
  а `set-password` требует OTP на **утраченный** контакт ⇒ тупик. Нужен админский путь восстановления **с аудитом** и
  запись в инструкцию поддержки — отдельная задача, 0017 не блокирует.

## Новые shared-порты (никаких импортов «модуль → модуль»)

- **`OTP_CHALLENGES`** (владелец — OTP-контекст): `start({ target, purpose }) → { challengeId, expiresAt }` и
  `verify({ target, purpose, code })` — проверка **по target+purpose**, чтобы перевыпуск челленджа не ломал начатый change.
- **`USER_CONTACTS`** (владелец — user-контекст): `applyVerifiedChange({ keycloakId, email?, phone? }) → UserDto`;
  внутри — новый доменный метод `User.applyVerifiedContactChange(...)`, а прямой `updateContacts` по-прежнему запрещает
  менять verified-контакт.

## Последствия

- Появляются 2 shared-порта и доменный метод; коды `ChangeTokenExpired` / `ContactChangeAlreadyPending` начинают уходить
  на провод (гардрейл обновится осознанно).
- Зависимость от **ADR-0018**: без отзыва access-токенов смена контакта не закрывает окно уязвимости.
- Нужен **drift-детектор** KC ↔ shadow (отдельная задача).
- Путь (A) — две настройки реалма в DEPLOYMENT; путь (B) — правки только в коде.

## Альтернативы

| Вариант | Почему нет |
| --- | --- |
| Контакт только в shadow-БД | password-grant и CIBA-`login_hint` работают по `username` в KC → пользователя не найдут |
| Синтетический `username` (uuid) | Ломает ADR-0015: `login_hint` резолвится только по username/email |
| Менять только Keycloak | Наш lookup/anti-enumeration и уникальность контакта живут в shadow-БД |
| Интроспекция каждого access-токена в KC | Сетевой вызов на каждый запрос (отклонено в ADR-0018) |

## Ответы координатора на открытые вопросы

1. **Смена `username`** — проверить живым стеком (проверено, см. выше); переименовывать только при необходимости;
   выбор пути (A)/(B) — за координатором.
2. **Подтверждать старый контакт при смене email** — **обязательно**.
3. **TTL `changeToken`** — **10 минут** + возможность перевыпуска челленджа внутри одного change.

## Ссылки

- `docs/auth-suite-backend-checklist.md` § Phase 4
- `docs/adr/0015-ciba-token-minting.md` — почему `username` = контакт
- `docs/adr/0018-access-token-revocation.md` — отзыв access-токенов
- `docs/adr/0011-otp-storage-hashing-and-limits.md` — челлендж-стор, `verificationToken`
