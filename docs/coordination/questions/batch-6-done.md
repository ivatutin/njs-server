# batch-6 выполнен: `ProfileNameInvalid` (422) вместо лживого 503

- **Кому:** координатор
- **От кого:** сессия `njs-server`
- **Дата:** 21.10.2026
- **Статус:** отвечено
- **Контракт:** v1.7, зеркало `sha256 = D8A4B7B3…` — совпало с `contract.sha256` (перекопировано тобой, закоммичено как есть).
- Коммит: **`d61d06e`**.

## Что сделано

1. **Реестр:** `PROFILE_NAME_INVALID: 'ProfileNameInvalid'` (`src/shared/domain/errors/error-code.ts`, секция v1.7).
2. **Доменная ошибка** `user/domain/errors/profile-name-invalid.error.ts` — `extends RuleViolationError`
   (фильтр отдаёт `422`, `error: "ProfileNameInvalid"`).
3. **Классификация в адаптере** (`keycloak-identity-profile.adapter.ts`), ровно по таблице задачи:

   | Ответ Keycloak на `PUT /users/{id}` | Клиенту |
   |---|---|
   | `400` (`error-user-attribute-required`, `person-name-prohibited-characters`, любой иной) | **`422 ProfileNameInvalid`** |
   | `401` / `403` (сервисный аккаунт, права) | `503 ServiceUnavailable` |
   | `5xx`, сеть, таймаут | `503 ServiceUnavailable` |

   Логирование из batch-5 сохранено полностью (статус + тело, без PII).
4. **DTO не трогал** — символов в Zod не добавлял (политика имён остаётся в Keycloak, одна точка правды).

## Живой прогон (host-инстанс, стенд поднят)

```
PATCH /users/me/profile {firstName: "Иван<>"}  -> 422
  {"statusCode":422,"error":"ProfileNameInvalid",
   "message":"Profile name is not accepted by the identity provider policy"}
PATCH /users/me/profile {firstName: "Пётр"}    -> 200 (в т.ч. кириллица)
```

**Что реально ответил Keycloak** (из лога адаптера — это и есть «какие коды видел живьём»):

```json
{"field":"firstName","errorMessage":"error-person-name-invalid-character","params":["firstName"]}
```

Обрати внимание: код — **`error-person-name-invalid-character`**, а не `person-name-prohibited-characters`,
как предполагалось в задании. Классификация по **статусу `400`** (как ты и написал: «400 от этого эндпоинта
всегда про профиль») поэтому и выбрана — она не зависит от точного имени кода. Если когда-нибудь Keycloak начнёт
отдавать `400` за что-то не про профиль, это будет видно по телу в логе.

**Изменение wire-поведения:** `400`-кейс больше не выглядит как авария — клиент получает `422` и **читаемое**
сообщение (фильтр не маскирует `message` у 4xx, в отличие от 5xx). `503` остался только для инфраструктуры,
семантика «повтор возможен» сохранена. `Retry-After` к `422` не относится.

## Тесты и зелёные

- `keycloak-identity-profile.adapter.spec.ts`: +4 — три параметризованных `400`-кейса
  (`error-user-attribute-required`, `person-name-prohibited-characters`, `error-invalid-email` → `422`
  с кодом `ProfileNameInvalid`) и матрица `401/403/502/сеть → 503`.
- `domain-error.spec.ts`: снапшот реестра v1.7 + код в списке «что ходит по проводу».
- `lint` 0 · **66 suite / 387 тестов** (было 383) · `build` 0.
- Уборка: тестовый пользователь удалён (KC + shadow `DELETE 1`), хост-инстанс остановлен, в реалме снова
  `admin-dev`, `user-dev`, `test@test.com`.

## Что не делал (и почему)

- **`docs/AUTH-FLOWS.md`** — в §11/§14 сейчас написано «Keycloak недоступен → 503». После v1.7 туда просится
  одна строка: «отказ политики имён → 422 `ProfileNameInvalid`». По правилу «docs — по согласованию ДО коммита»
  не трогал. **Разреши — поправлю одним коммитом** (или скажи, что синхронизируешь при деривации).
- Чек-лист обновил (секция «Итерация 2.1 — контракт v1.7») как tracking-документ, поведение не менялось.

**сверено с кодом:** `keycloak-identity-profile.adapter.ts` (классификация `isProfilePolicyRejection`, `throw new
ProfileNameInvalidError`), `profile-name-invalid.error.ts:1-24`, `error-code.ts` (секция v1.7),
`all-exceptions.filter.ts` (`DomainError` → `code` в `error`, `RuleViolationError` → 422),
живой лог `.dev-host.log` (тело Keycloak), `git show --stat d61d06e`.
