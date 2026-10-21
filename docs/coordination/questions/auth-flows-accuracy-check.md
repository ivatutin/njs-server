# Проверка актуальности `docs/AUTH-FLOWS.md`: 2 пробела + 2 мелочи — нужна санкция на правку

- **Кому:** координатор
- **От кого:** сессия `njs-server`
- **Дата:** 21.10.2026
- **Статус:** вопрос
- **Контекст:** владелец попросил проверить актуальность схем. Проверил документ построчно против кода
  (константы, ключи Redis, маршруты, коды ответов) и прогнал рендер: **12/12 Mermaid-блоков валидны**.
  Содержательно документ верный, но есть два реальных пробела. **Ничего не менял** — docs-стоп; прошу санкцию.

## Что сошлось с кодом (проверено, не по памяти)

| Раздел | Что проверил | Итог |
|---|---|---|
| §1 | образы: KC `26.8.0`, `postgres:16.15-alpine`, `valkey/valkey:8-alpine`; связи и протоколы | ✔ |
| §2 | TTL/ключи: `change` 600 с, `change-quota` 86 400 с, `reauth` 300 с, `reauth-fail` 900 с/5, `otp:verification` 600 с, `ciba:mint` 180 с, `otp:rl` 60/3600 с (3 и 10), `sub-revoked` = TTL+60 | ✔ (кроме одного отсутствующего ключа — ниже) |
| §3 | `SignInUseCase`: handle по email → password grant → JWKS → admin `findById` (best-effort) → событие → upsert | ✔ |
| §4 | guard: `@Public` → заголовок → JWKS (`azp`, `iat`) → `MGET` → `@Roles` | ✔ |
| §5 | коды ответов: `refresh` 200, `sign-out` 204 (+ блоклист), `logout-all` 204 (+ метка `sub`) | ✔ |
| §6 | опрос 10 с, `resend` 202, дедуп `time:sub` | ✔ |
| §7 | лимиты 60 с / 3 в час / 10 в час, 5 попыток, `verificationToken` 600 с, анти-энумерация | ✔ |
| §8 | grant `urn:openid:params:grant-type:ciba`, callback через ~100 мс ×3, `GETDEL` заявки, `login_hint` = handle | ✔ |
| §9 | порядок `request` (проверки → челленджи → токен), `verify` (отзыв → shadow → KC ×3 → компенсация), `Retry-After` | ✔ |
| §10 | reauth 5/15 мин + logout сессии + токен 300 с; смена/установка: отзыв → запись; `forgot` 202 + ссылка 3600 с | ✔ |
| §11 | ветка v1.7 `400 → 422 ProfileNameInvalid` (проверена живьём) | ✔ |
| §12 | 1800 с, страница 100, `heal` | ✔ |
| §13 | все **25** маршрутов сверены с контроллерами; замечание «`suspend`/`delete` не отзывают доступ» — верно | ✔ |
| §15 | пути к файлам существуют | ✔ |

## Что просит правки

1. **Нет схемы звонкового канала (ADR-0014).** В документе есть только строки в §13, а потока нет:
   `POST /auth/phone/call` → провайдер (SMS.ru callcheck) → `GET /auth/phone/call/:challengeId` (polling фронта)
   и `POST /callbacks/smsru` (вебхук) → `PhoneCallRefresher` опрашивает провайдера → `verified` → `verificationToken`.
   Плюс константы, которых нет в документе: окно звонка **300 с**, статусы `pending/verified/expired/failed`,
   минимальный интервал опроса **5 с**. Предлагаю отдельный короткий §7.1 (схема + 4 строки текста).
2. **Ключ `otp:claim:<challengeId>`** (`SET NX`, TTL 600 с) отсутствует в таблице §2. Он гарантирует, что
   `verificationToken` по звонку выдаётся **ровно один раз** при гонке «вебхук + polling». Строка в таблицу.
3. **§7, подпись в схеме:** `otp:active:<hash(target+purpose)>` → привести к коду `sha256(target|purpose)`
   (в таблице §2 уже правильно).
4. **§9, опечатка:** «запись смены (но TTL 10 мин)» → «(и TTL 10 мин)» — сейчас читается как противоречие.
5. (Заодно) §2/§7: «срок кода» → «5 мин (`OTP_TTL_SECONDS` = 300)».

## Вопрос

Разрешаешь **один docs-коммит** с этими правками (объём — ~35 строк, только `docs/AUTH-FLOWS.md`), или
переносим на `videano-back` (тогда зафиксирую как долг в чек-листе)? После правки, как договорились, снова
docs-стоп; рендер прогоню по всем блокам.

**сверено с кодом:** `keycloak-http.client.ts:96-146` (CIBA), `otp-policy.ts` (`OTP_TTL_SECONDS=300`,
`CALL_WINDOW_SECONDS=300`, `CALL_POLL_MIN_SECONDS=5`, `CALL_STATUSES`), `phone-call-refresher.service.ts:44-82`,
`redis-otp-challenge.store.ts:70-95` (`otp:claim:*`, `otp:active:*`), `redis-*-store.ts` (TTL/ключи),
`auth.controller.ts` (`@HttpCode`), `user.controller.ts` (маршруты), `docker-compose.yml` (образы).
