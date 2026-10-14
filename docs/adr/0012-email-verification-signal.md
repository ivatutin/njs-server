# ADR 0012: Как backend узнаёт о подтверждении email (Keycloak VERIFY_EMAIL)

- **Дата:** 2026-10-09
- **Статус:** Accepted

## Контекст

Phase 1 auth-suite — email-регистрация через magic link: Keycloak создаёт учётку,
отправляет письмо, пользователь кликает — и Keycloak считает email подтверждённым.
Нам нужно, чтобы после этого наша shadow-запись стала `emailVerified = true,
status = active` (на неё смотрит фронт через `GET /users/me`).

Проблема: у Keycloak **нет** штатного способа доставить событие наружу — для этого
пишут Java-SPI плагин (`EventListenerProvider`, JAR в `/opt/keycloak/providers` +
`kc.sh build`). При этом пользовательские события Keycloak складывает в свою БД и
отдаёт через Admin Events API (`GET /admin/realms/{realm}/events`), если в realm
включены events.

## Решение

1. **`KeycloakEventListenerService`** (auth/infrastructure) каждые 10 с читает
   `GET /admin/realms/{realm}/events?type=VERIFY_EMAIL&dateFrom=<yyyy-MM-dd>`,
   приводит события к доменному виду и публикует `EmailVerifiedEvent`
   (`auth.email-verified`) в наш EventBus.
2. **`OnEmailVerifiedHandler`** (user/application) по `keycloakId` находит shadow-user,
   вызывает `user.verifyEmail()` (идемпотентно) и сохраняет: pending-аккаунт
   автоматически становится `active`.

Детали, найденные **живой проверкой** (критично для сопровождения):

1. **`dateFrom` принимается только как `yyyy-MM-dd`.** ISO-8601 с временем (и с `Z`,
   и без) → `400 Bad Request`. Окно получается суточным, что безопасно: listener
   дедуплицирует события по ключу `time:keycloakId`, а обработчик идемпотентен.
2. **Service account нужен `realm-management/view-events`** — иначе `403` на чтение
   событий (для создания пользователей нужен отдельный `manage-users`).
3. **`sendVerifyEmail` вызывается без `client_id`.** С ним ссылка из письма
   привязывается к бэкенд-клиенту (`app-backend`), у которого нет браузерного flow,
   и Keycloak показывает страницу логина вместо подтверждения.
4. **В Keycloak 26 клик по ссылке — двухшаговый** (страница «Email address
   validation» → `login-actions/required-action`), и он требует cookie-сессии,
   поэтому скриптовая проверка должна идти с cookie-jar, а не одним `fetch`.

## Последствия

Положительные:

- событийная архитектура сохранена: auth владеет Keycloak и публикует событие,
  user-контекст сам приводит свою БД в порядок (нет импортов модуль-в-модуль);
- никаких Java-артефактов и Maven-сборки в репозитории;
- повторная обработка безопасна: дедупликация + идемпотентный `verifyEmail()`.

Отрицательные и mitigation:

- **Задержка обнаружения до 10 с.** Приемлемо: фронт и так поллит `GET /users/me`
  каждые 5 с (контракт Phase 1).
- **Зависимость от включённых events и `eventsExpiration`.** Если события хранятся
  коротко, а поллер лежал — верификация «потеряется». Mitigation: в dev/prod
  проверять `eventsEnabled` и держать `eventsExpiration` с запасом (у нас 1 час),
  а также добавить ленивый досинк (см. альтернативы) как страховку.
- **Поллинг = 1 запрос на инстанс каждые 10 с.** При нескольких инстансах нужен
  лидер/единый воркер, иначе будут дублирующие публикации (для идемпотентного
  обработчика безвредно, но лишний шум).
- **`view-events` в service account** расширяет права сервисной учётки.

## Известное ограничение конфигурации (найдено при проверке)

> ✅ **Решено в [ADR-0013](./0013-keycloak-issuer-and-public-url.md)**: ожидаемый issuer
> вынесен в `KEYCLOAK_ISSUER`, а Keycloak получил публичный `KC_HOSTNAME`. Ниже — исходное
> описание проблемы (оставлено для истории).

Ссылка в письме содержит тот хост, которым Keycloak себя считает (frontend URL).
В dev `KC_HOSTNAME` не задан → ссылка получает **внутренний** адрес
(`http://keycloak:8080/...`), который не откроется из браузера; action-token подписан
с тем же issuer, поэтому «подмена хоста» ломает токен (`EXECUTE_ACTION_TOKEN_ERROR`).
В проде `docker-compose.prod.yml` задаёт `KC_HOSTNAME`, но приложение ходит в Keycloak
по внутреннему `KEYCLOAK_URL` — тогда ожидаемый приложением issuer разойдётся с
фактическим, и protected-эндпоинты начнут отдавать 401. Требуется решение вне Phase 1
(вынести ожидаемый issuer/публичный URL в отдельную переменную) — зафиксировано как
follow-up.

## Альтернативы

- **Java-SPI плагин** — нативно и без задержки, но добавляет Java-модуль, Maven и
  `kc.sh build`; избыточно для пилота.
- **Ленивый синк** при `GET /users/me` (спросить Keycloak про `emailVerified`) — не
  нужен `eventsEnabled`, но чтение начинает зависеть от Keycloak, а user-контексту
  потребовался бы доступ к identity-порту; оставлено как возможный fallback.
- **Webhook из Keycloak** — реализуется тем же SPI, отвергнут по той же причине.

## Ссылки

- `docs/auth-suite-backend-checklist.md` (Phase 1), `docs/auth-v1-contract.md`
- ADR [0004](./0004-keycloak-as-identity-provider.md), ADR [0009](./0009-keycloak-26-optimized-image.md)
- Keycloak Admin REST: [Events](https://www.keycloak.org/docs-api/latest/rest-api/index.html#_events)
