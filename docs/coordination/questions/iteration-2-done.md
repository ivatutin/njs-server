# Итерация 2 выполнена: A–F закрыты, проверено живьём

- **Кому:** координатор
- **От кого:** сессия `njs-server`
- **Дата:** 20.10.2026
- **Статус:** отвечено

Ветка `main`: **`0f8c34f`** (плюс `18e5997` — рабочая копия: зеркало v1.6, `docs/coordination/`, `.dev-host*.log` в `.gitignore`).
`lint` 0, `tsc` 0, `build` 0, **66 suite / 381 тест** (было 61/348). Зеркало контракта `sha256 = 2D6069E8…7FDB5FB` — совпадает
с `contract.sha256`, байт-в-байт с `…\docs\auth\contract.md`.

## A. `PATCH /users/me/profile` (контракт v1.6)

- Protected, **без** `@Roles`, `id` = `sub` из токена, тело `{ firstName?, lastName? }` (1–100, хотя бы одно),
  ответ `200 UserResponseDto`. Маршрут объявлен **выше** `@Patch(':id/profile')` (есть тест на порядок — иначе `me`
  уходил в `:id` и `ParseUUIDPipe` отдавал 400).
- Порядок записи: **сначала Keycloak, затем shadow**. Keycloak недоступен → `503`, shadow **не тронут**.
- Важная деталь: `PUT /users/{id}` — **полная замена**, поэтому адаптер (`keycloak-identity-profile.adapter.ts`)
  читает представление и переносит его целиком (`username`, `email`, `emailVerified`, `enabled`, `attributes`,
  `requiredActions`), меняя только имя. Это та же ловушка, что была у `updateContacts` на приёмке.
- Шина: `user/domain/ports/identity-profile.port.ts` + `IdentityProfileUnavailableError extends ServiceUnavailableException`.

**Живьём (хост-приложение `APP_PORT=3101`, стенд общий):**

```
KC user: usr_pchk638278 / 36eb6529-… / first=Ivan last=Petrov
A/1 PATCH: status=200 firstName=Petr lastName=Petrov
A/2 KC after PATCH: firstName=Petr lastName=Petrov email=profile-check-638278@example.com username=usr_pchk638278 requiredActions=[]
A/3 after second sign-in: firstName=Petr lastName=Petrov     <- критерий «выход/вход — имя на месте»
400 empty body: 400 | 400 101 chars: 400 | 400 empty string: 400 | 401 no token: 401
PATCH with keycloak down (docker compose stop keycloak): status=503
after (shadow must be unchanged): firstName=Sidor lastName=Petrov   <- ничего не применено
PATCH after keycloak is back: firstName=Petr
docs-json: /api/v1/users/me/profile -> request #/components/schemas/UpdateUserProfileDto, response UserResponseDto
```

Тестовый пользователь и его shadow-строка удалены (`DELETE 1`, остаток 0); в реалме `usr_pchk*` нет.

## B. Sync имени на входе

- `UserSignedInPayload` += `firstName?`/`lastName?`; наполняет auth-модуль: `SignInUseCase` → `IDENTITY_ADMIN.findById`
  (best-effort — отказ админ-API не валит вход, догон на следующем входе).
- `OnUserSignedInHandler`: первый вход — создаёт пользователя **с именем**; повторный — досинхронизирует при
  расхождении (`undefined` = не передано, `null` = в Keycloak пусто). Заглушка `Profile sync for verified contact
  not implemented` заменена работой; email-дрейф остался warn (смена подтверждённого email — `contact-change`).

**Живьём:**

```
B/1 after first sign-in shadow: firstName=Ivan lastName=Petrov
B/2 after KC edit (PUT firstName=Sidor) + new sign-in: firstName=Sidor lastName=Petrov
```


## C. Коды в реестр

`FORBIDDEN: 'Forbidden'` (v1.5) и `SERVICE_UNAVAILABLE: 'Service Unavailable'` (v1.6) добавлены; снапшот реестра
обновлён. Живая проверка строки на 503 (тот же фильтр, контейнерный инстанс): `{"statusCode":503,…,
"error":"Service Unavailable","message":"Internal server error"}` — фронт теперь может матчить 503 по коду, а не по статусу.

## D. `Retry-After` на любом 503 из `contact-change/verify`

Общий хелпер `auth/interfaces/http/retry-after.ts` (`applyRetryAfterHeader`), не копипаста: классификация **по статусу**,
своё значение (`ContactChangeUnavailableError.retryAfterSeconds` = 5) берётся, если есть, иначе консервативные **30 с**.
Покрывает все пути 503 этого эндпоинта: компенсация удалась, терминальное `failed`, отказ отзыва доступа
(`Access revocation failed`), падение KC-адаптера. Не-503 заголовок не получают. Тест — на оба пути.

## E. Рецепт dev-стенда в `LOCAL_DEV.md`

Раздел «Приёмка звонкового канала (CIBA) на dev-стенде»: `docker compose stop app` → `APP_PORT=3001 npm run start:dev`
→ `CIBA_CHANNEL_URL=http://host.docker.internal:3001/api/v1/internal/ciba/channel` →
`docker compose up -d --force-recreate keycloak`, с объяснением причин (контейнер = production → заглушки 503; KC зовёт
канал по контейнерному адресу; `--force-recreate` обязателен, т.к. это env контейнера) и альтернатива «два инстанса»
(`APP_PORT=3101` + общий Redis).

## F. «Холодный» путь `sign-up/phone`

- Добавлен `AuthWarmupService` (`OnApplicationBootstrap`): греет service-account токен Keycloak и JWKS, таймаут 5 с,
  ошибки старт не валят. **Живой лог хост-приложения:** `keycloak admin token warmed in 465 ms`,
  `keycloak JWKS warmed in 71 ms`.
- В `LOCAL_DEV.md` зафиксировано: что снимается прогревом; что остаётся разовым (инициализация только что поднявшегося
  KC, первый CIBA-запрос, TLS); **структурный пол 5–7 с** — минт всегда ждёт `interval` (5 с) из `backchannel-auth`;
  формулировка «первый вход после простоя до ~35 с — прогрев, не дефект» и правило клиента (`sign-up/*`
  неидемпотентны → автоматический повтор запрещён, после обрыва предлагать вход).

## Тесты (+33, 66 suite / 381)

`update-my-profile.use-case` (5) · `keycloak-identity-profile.adapter` (5, включая read-modify-write и оба 503) ·
`on-user-signed-in.handler` (+5: создание с именем, догон, `undefined`, `null`, одна запись при имени+ролях) ·
`user.controller.me-profile` (7: частичное тело, 503, валидация 1–100) · `retry-after` (4) · `auth-warmup.service` (2) ·
`sign-in.use-case` (+2: имя из KC, best-effort при отказе) · `user.controller.roles` (+3: без ролей, порядок маршрутов,
не `@Public`) · снапшот реестра кодов.

## Расхождения / на что обратить внимание

1. **Инфраструктурная правка:** `KeycloakAdminClient` переехал в `src/shared/infrastructure/keycloak/`
   (+ `@Global KeycloakAdminModule`), потому что клиент нужен **двум** контекстам (auth и user), а импорт
   «модуль → модуль» правилами запрещён. Импорты обновлены (`auth.module.ts`, `keycloak-admin.adapter.ts`, тест адаптера).
   Если хочешь иначе (например, адаптер в auth с экспортом порта) — переделаю.
2. **Контракт не менял.** Всё аддитивно относительно v1.6: новых кодов/полей/эндпоинтов сверх контракта нет.
3. **Валидация DTO 1–100** добавилась и к админскому `PATCH /users/:id/profile` (тот же DTO) — для админа ужесточилось
   только на пустые строки и >100 символов, как и написано в контракте.
4. **Стенд:** контейнер `app` поднят (healthy), принимал на 3001; для живой проверки хостовый инстанс работал на 3101
   (по рецепту E) и остановлен. Keycloak дважды останавливался/поднимался для проверки 503 — вернулся healthy.
   В реалме сейчас 12 пользователей: три dev-аккаунта + `test@test.com` + `usr_*` (handle-аккаунты живых прогонов
   фронта, не мои). Моих хвостов нет.
5. **CI-прогон** по-прежнему отложен (решение владельца) — зелёная точка локальная.

**сверено с кодом/живым API:** `user.controller.ts` (маршрут выше `:id/profile`), `update-my-profile.use-case.ts`,
`keycloak-identity-profile.adapter.ts`, `on-user-signed-in.handler.ts`, `sign-in.use-case.ts`,
`error-code.ts`, `retry-after.ts`, `auth-warmup.service.ts`, `LOCAL_DEV.md`; живые ответы — в блоках выше.
