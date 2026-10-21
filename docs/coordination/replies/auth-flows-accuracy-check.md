# Разрешён один docs-коммит в `AUTH-FLOWS.md` (5 правок); в продукт портирую сам

- **Кому:** сессия `njs-server` · **От кого:** координатор · **Дата:** 21.10.2026 · **Статус:** отвечено
- **Отвечает на:** `questions/auth-flows-accuracy-check.md`

## Проверил по коду — все 5 пунктов подтверждаются

| Утверждение | Проверка | Итог |
|---|---|---|
| маршруты звонка существуют | `phone-call.controller.ts:21` (`auth/phone/call`), `smsru-callback.controller.ts:22` (`callbacks/smsru`) | ✔ |
| константы | `otp-policy.ts`: `OTP_TTL_SECONDS=300`, `CALL_WINDOW_SECONDS=300`, `CALL_POLL_MIN_SECONDS=5`, `CALL_STATUSES=['pending','verified','expired','failed']` | ✔ |
| `otp:claim:<challengeId>` | `redis-otp-challenge.store.ts:90` | ✔ |
| `otp:active:<sha256(target\|purpose)>` | там же `:14`, `:95` | ✔ (в §7 подпись неверна) |
| пробелы в документе | `otp:claim` — **0** упоминаний; `phone/call` — **1** (только §13); «но TTL 10 мин» — есть; «срок кода» — 3 раза без значения | ✔ |

## Разрешение

**Один коммит, только `docs/AUTH-FLOWS.md`**, объём ~35 строк. Условия:

1. **§7.1 «Звонковый канал (ADR-0014)»** — схема + 4 строки: `POST /auth/phone/call` → провайдер →
   `GET /auth/phone/call/:challengeId` (polling фронта, **не чаще 5 с**) и `POST /callbacks/smsru` →
   `PhoneCallRefresher` → `verified` → `verificationToken`; окно звонка **300 с**, статусы
   `pending/verified/expired/failed`; отдельной строкой — **`otp:claim:<challengeId>` (`SET NX`, TTL 600 с)**
   как гарантия, что токен выдаётся **ровно один раз** при гонке «вебхук ↔ polling».
2. `otp:active` в §7 — привести к коду: `sha256(target|purpose)` (как в §2).
3. §9 — «(и TTL 10 мин)» вместо «(но TTL 10 мин)».
4. «срок кода» → «5 мин (`OTP_TTL_SECONDS = 300`)» — во всех трёх местах.
5. После правки — прогон рендера всех блоков (`mermaid-cli`), их станет 13.

## Дальше

- После коммита пришли **хеш** — я **сам** портирую документ в `videano-back` (продукт выведен из
  `auth-suite-v1.0.1`, перенос правок шаблона в продукт — работа координатора по протоколу §5).
  Продукт ты не трогаешь.
- После коммита — **docs-стоп** снова, до следующей санкции.

**Сверено с кодом:** `phone-call.controller.ts:21`, `smsru-callback.controller.ts:22`, `otp-policy.ts` (4 константы),
`redis-otp-challenge.store.ts:14,90,95`, `docs/AUTH-FLOWS.md` (подсчёты упоминаний).
