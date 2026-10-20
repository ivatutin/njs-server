# Принято: итерация 2 (A–F) — замечаний нет, шаблон замораживается под тег

- **Кому:** сессия `njs-server` · **От кого:** координатор · **Дата:** 20.10.2026 · **Статус:** принято
- **Отвечает на:** `questions/iteration-2-done.md`

## Проверено фактами (не по отчёту)

| Утверждение | Как проверял | Результат |
|---|---|---|
| `main` = `0f8c34f` | `git log`, `git status` | ✔ `7378cad` (отчёт) → `0f8c34f` → `18e5997`; дерево **чистое** |
| 66 suite / 381 тест | запустил `npm test` у тебя | ✔ `Test Suites: 66 passed`, `Tests: 381 passed` |
| зеркало `2D6069E8…` | `Get-FileHash` | ✔ совпадает с `contract.sha256` |
| маршрут `me/profile` выше `:id/profile` | `user.controller.ts` | ✔ `@Patch('me/profile')` :123, `@Patch(':id/profile')` :148 |
| `PUT /users/{id}` = полная замена (read-modify-write) | `keycloak-identity-profile.adapter.ts` :13, :47 | ✔ представление переносится целиком |
| `Retry-After` — общий хелпер, не копипаста | `auth/interfaces/http/retry-after.ts` | ✔ |
| прогрев | `auth/application/services/auth-warmup.service.ts` | ✔ |
| коды в реестре | `error-code.ts` | ✔ `FORBIDDEN`, `SERVICE_UNAVAILABLE` |
| `.dev-host*.log` не в git | `git status` + `.gitignore` | ✔ |
| рецепт стенда | `LOCAL_DEV.md:77+` | ✔ |
| контракт не менялся | зеркало = `docs/auth/contract.md` v1.6 | ✔ |

## Решения

1. **Инфраструктурный перенос одобрен.** `KeycloakAdminClient` → `src/shared/infrastructure/keycloak/` +
   `@Global KeycloakAdminModule` — правильно: клиент нужен двум контекстам, импорт «модуль → модуль» правилами
   запрещён. **Не переделывай.**
2. **Контракт остаётся v1.6.** Новых кодов/полей/эндпоинтов сверх него нет, версия не поднимается.
3. **Уточнение по путям (правку не требует):** `IdentityProfileUnavailableError` лежит в `user/domain/errors/…`,
   а не в `domain/ports/` — для точности в следующих отчётах.
4. **Находка про `PUT /users/{id}`** внесена в `docs/shared/glossary.md` как термин: это ловушка, на которой уже
   спотыкались дважды (контакты на приёмке, теперь профиль) — она пригодится и `videano-back`.

## Что дальше

- **Шаблон заморожен.** До тега `auth-suite-v1.0` в `main` не коммить: тегировать буду `0f8c34f` по команде владельца.
  После тега шаблон не правится — всё новое идёт в `videano-back`.
- Следующий скоуп придёт **новым брифом и промптом** (`videano-back`, фаза 1: Stream/Recording).
- Если владельцу понадобится правка в шаблоне — сначала файлом мне, не коммитом.

Работа закрыта, замечаний нет.
