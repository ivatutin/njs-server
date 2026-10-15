# ADR 0017: Смена контакта (email/phone) — синхронизация Keycloak и shadow-БД

- **Дата:** 2026-10-15
- **Статус:** **Proposed** — механизм внутренний (эндпоинты и коды заморожены контрактом v1.3, новых решений координатора
  не требует), но затрагивает инвариант verified-контактов и сессии, поэтому оформляю решением до кода.
- **Связано:** ADR-0004 (Keycloak), ADR-0015 (CIBA, `username` = контакт), ADR-0011 (OTP-хранилище), чек-лист Phase 4

## Контекст

Phase 4 добавляет смену контакта тремя эндпоинтами (`contact-change/request|verify|cancel`, коды `ChangeTokenExpired`,
`ContactChangeAlreadyPending`, `ContactAlreadyExists`, `OtpInvalid`, `OtpExpired` — уже в реестре).

Контакт у нас живёт **в двух хранилищах**, и это не дублирование, а разные роли:

| Где | Что хранится | Зачем |
| --- | --- | --- |
| Keycloak | `username` (= сам контакт: email у email-пользователя, телефон у phone-пользователя, ADR-0015), `email`, `emailVerified`, атрибуты `phoneNumber`/`phoneVerified` | вход (password grant, CIBA-`login_hint`), письма, Account Console |
| shadow-БД (`User`) | `email`, `phone` (`@unique`), `*_verified_at`, статус | источник правды для lookup, anti-enumeration, бизнес-логика |

Плюс в `User` есть инвариант: **verified-контакт нельзя менять напрямую** (422 `InvalidContacts`) — смена обязана идти
санкционированным путём через подтверждение кодами.

## Решение

### 1. Контакт меняется согласованно, `username` следует за контактом

Порядок в `verify`: сначала Keycloak, затем shadow-БД (если KC не принял — наша БД остаётся прежней, состояние
самосогласовано и повторяемо). `username` **переименовываем** вместе с контактом, иначе CIBA-`login_hint` перестанет
находить пользователя (ADR-0015): у phone-пользователя `username` = новый телефон, у email-пользователя — новый email.
Коллизия проверяется заранее (shadow `@unique` + `CONTACT_LOOKUP`) и отдаётся как `409 ContactAlreadyExists`.

### 2. Поток

```
POST /users/me/contact-change/request   protected + X-Reauth-Token
  → проверка занятости нового контакта (409 ContactAlreadyExists)
  → один активный change на пользователя, иначе 409 ContactChangeAlreadyPending
  → челленджи: new всегда (purpose='change-contact-new'), old — если есть что подтверждать
    (purpose='change-contact-old', target = текущий контакт)
  → 201 { changeToken, requiresOldChallenge, oldChallengeId?, newChallengeId }

POST /users/me/contact-change/verify     protected   { changeToken, oldCode?, newCode }
  → проверка кодов (shared-порт OTP_CHALLENGES)
  → Keycloak: username+email/attributes/emailVerified  →  shadow-БД: контакт + verified
  → гасим ВСЕ сессии пользователя в Keycloak
  → 200 UserDto

POST /users/me/contact-change/cancel     protected   { changeToken } → 204
```

### 3. Новые shared-порты (правило «никаких импортов модуль → модуль»)

- **`OTP_CHALLENGES`** (владелец — OTP-контекст): `start({ target, purpose }) → { challengeId }` и
  `verify({ challengeId, code }) → { target, purpose }`. Порт нужен, потому что `request` обязан вернуть id челленджей,
  а `verify` — принимать коды (не `verificationToken`: контракт даёт именно коды).
- **`USER_CONTACTS`** (владелец — user-контекст): `applyVerifiedChange({ keycloakId, email?, phone? }) → UserDto`.
  Реализация внутри использует новый доменный метод `User.applyVerifiedContactChange(...)`, который **санкционированно**
  меняет verified-контакт и активирует пользователя; прямой `updateContacts` по-прежнему запрещает такие изменения.

### 4. Сессии гасим

Контакт = идентификатор входа, поэтому после успешной смены вызываем admin-API `POST /users/{id}/logout` (все сессии
пользователя). Иначе украденный пароль + смена контакта оставили бы атакующему живую сессию. Пользователь логинится
заново — это ожидаемое поведение для смены логина.

### 5. `changeToken`

НЕ одноразовый (им пользуются и `verify`, и `cancel`), TTL 15 минут, в Redis, привязан к `keycloakId`, хранится **хешем**
(как reauth-токен). Один активный change на пользователя; `cancel` снимает его и челленджи.

## Обнаруженное ограничение (для координатора, не требует изменения контракта)

У **passwordless** phone-пользователя `contact-change/request` невозможен: он требует `X-Reauth-Token`, а пароля у такого
пользователя нет. Его путь — сначала `POST /users/me/set-password` (Phase 4), затем смена контакта. Это следствие
контракта (`request` защищён reauth), а не баг; стоит упомянуть в доке фронта/поддержки.

## Последствия

- Появляются два shared-порта и один доменный метод; `CHANGE_TOKEN_EXPIRED`/`CONTACT_CHANGE_ALREADY_PENDING` наконец
  начинают уходить на провод (гардрейл кодов обновится осознанно).
- KC-перенаименование — операция admin-API; проверяем на живом стеке, что реалм её разрешает и что после неё
  password-grant/CIBA работают с новым логином.
- Никакой миграции данных не нужно: контакт всегда есть и в KC, и в shadow.

## Альтернативы

| Вариант | Почему нет |
| --- | --- |
| Хранить контакт только в shadow-БД | CIBA-`login_hint` и password-grant работают по `username` в KC → не найдут пользователя |
| Синтетический `username` (uuid) | Ломает ADR-0015: `login_hint` резолвится только по username/email |
| Менять только Keycloak | Наш lookup/anti-enumeration и уникальность контакта живут в shadow-БД |
| Оставить старые сессии живыми | Смена логина не должна сохранять доступ старой сессии |

## Открытые вопросы (закрываются при реализации)

1. Разрешает ли наш реалм смену `username` через admin-API (проверить живьём).
2. Нужно ли подтверждать старый контакт при смене email (рекомендация: да — это второй фактор против угона пароля).
3. TTL `changeToken` = 15 минут — согласовать с UX фронта (в контракте не зафиксировано).

## Ссылки

- `docs/auth-suite-backend-checklist.md` § Phase 4
- `docs/adr/0015-ciba-token-minting.md` — почему `username` = контакт
- `docs/adr/0011-otp-storage-hashing-and-limits.md` — челлендж-стор и `verificationToken`
