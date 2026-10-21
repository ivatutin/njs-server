# Бэкенд: batch-6 — код `ProfileNameInvalid` (422) вместо лживого 503

- **Кому:** сессия `njs-server` · **От кого:** координатор · **Дата:** 21.10.2026 · **Статус:** handout
- **Контракт: v1.7** (аддитивно). Зеркало перекопировано, `sha256 = D8A4B7B352B25C2D381E869A035B0DFF89265726484C6FFC167F616E3DE856CD`

> Это **изменение моего** решения по твоему вопросу A/B/C: я выбрал C («ветка недостижима») — **ошибся**.
> Проверил `update-user-profile.dto.ts`: только длина 1–100, символы не ограничены, значит запрещённые символы
> отсекает уже Keycloak → `400` → `503` «повторите позже» **достижимо из UI**. Беру вариант **A**.

## Что сделать

1. **Доменная ошибка** `ProfileNameInvalidError` (422) с кодом `PROFILE_NAME_INVALID: 'ProfileNameInvalid'`
   в `src/shared/domain/errors/error-code.ts` + фильтр отдаёт `error: "ProfileNameInvalid"`.
2. **Классификация в адаптере** `keycloak-identity-profile.adapter.ts` (сейчас любой отказ → `IdentityProfileUnavailableError` → 503):

   | Ответ Keycloak на `PUT /users/{id}` | Что отдаём клиенту |
   |---|---|
   | `400` + `error-user-attribute-required` | **`422 ProfileNameInvalid`** |
   | `400` + `person-name-prohibited-characters` (или иной `error-user-attribute-*`) | **`422 ProfileNameInvalid`** |
   | `400` без разбора (прочее) | **`422 ProfileNameInvalid`** — 400 от этого эндпоинта всегда про профиль |
   | `401`/`403` (сервисный аккаунт, права) | `503 ServiceUnavailable` (инфраструктура) |
   | `5xx`, сеть, таймаут | `503 ServiceUnavailable` |

   Логирование из batch-5 **сохрани** — именно оно дало разбор.
3. **Тесты (+2)**: `400 error-user-attribute-required` → 422 с кодом `ProfileNameInvalid`; `503` от KC → по-прежнему
   `ServiceUnavailable`. Плюс проверь, что `PATCH /users/me/profile` с `firstName: "Иван<>"` даёт **422**, а не 503
   (живой прогон, если стенд поднят).
4. **Не делай** DTO-валидацию символов: политика имён — в Keycloak, дублировать её в Zod значит разъехаться при
   смене политики. 422 — нормальный канал обратной связи.

## DoD

- `lint` / `npm test` / `build` зелёные; +2 теста (было 66 suite / 383).
- Зеркало закоммичено, `sha256` = `D8A4B7B3…`.
- Отчёт файлом: что классифицировал, какие коды Keycloak видел живьём, что изменилось в wire-поведении.

**Сверено с кодом:** `update-user-profile.dto.ts` (только 1–100), `keycloak-identity-profile.adapter.ts:31-33,47-50,63`,
`error-code.ts` (реестр), твой отчёт `batch-5-done.md` (A/B/C).
