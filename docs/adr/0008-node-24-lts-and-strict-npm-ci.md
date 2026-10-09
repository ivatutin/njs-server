# ADR 0008: Node.js 24 LTS и строгий `npm ci` как baseline сборки

- **Дата:** 2026-10-08
- **Статус:** Accepted

## Контекст

Проект стартовал на **Node.js 20 LTS**: `docker/Dockerfile` (3 стадии, `node:20-alpine`), оба GitHub-workflow (`node-version: 20`). Версия рантайма была не зафиксирована в манифестах — не было ни `.nvmrc`, ни `engines`, ни синхронизации `@types/node` (стояло `^25.6.0`, то есть типы новее рантайма).

Отдельная проблема — **воспроизводимость установки зависимостей**:

```yaml
# pr.yml и main.yml
run: npm ci --include=optional || npm install --no-audit --no-fund
```

Fallback маскировал рассинхрон lockfile: сборка «проходила», но фактически на разных машинах ставились разные деревья зависимостей. В `docker/Dockerfile` было то же самое (`npm install` вместо `npm ci`) с комментарием, что lock сгенерирован на Windows и может расходиться с Linux-резолвом optional native deps (`@swc/core` и т.п.).

## Решение

1. **Node.js 24 LTS — единственная поддерживаемая версия:**
   - `docker/Dockerfile`: базовый образ `node:24-bookworm-slim` во всех трёх стадиях;
   - `.github/workflows/{pr,main}.yml`: `node-version: 24`;
   - `.nvmrc` = `24`; `engines.node` = `>=24.0.0 <25.0.0`; `@types/node` = `^24`.
2. **`npm ci --include=optional` без fallback** — в CI, в Dockerfile и локально. `--include=optional` нужен для платформо-специфичных нативных бинарников.
3. **Alpine → bookworm-slim** (glibc вместо musl) вместе с портированием alpine-специфики: `addgroup/adduser` → `groupadd/useradd`, healthcheck на BusyBox-`wget` → на встроенном в Node `fetch` (curl/wget в образ не добавляем).

## Последствия

Положительные:

- воспроизводимые сборки: `npm ci` падает при рассинхроне lock, а не «тихо чинит» его;
- glibc-образ: нативные бинарники (SWC, Prisma) не зависят от musl-совместимости;
- runtime с поддержкой до 2028 — апгрейд не придётся повторять на Phase 2–4 auth-suite;
- версия рантайма зафиксирована в четырёх точках (Dockerfile, workflow ×2, `.nvmrc`/`engines`).

Отрицательные и mitigation:

- **Риск красного CI**, если Windows-сгенерированный lock неполон для Linux. Mitigation: PR-CI — гейт; при падении lock перегенерируется отдельным коммитом. Локальный `docker build` (Linux-контейнер) проверяет тот же путь.
- Образ больше по размеру, чем alpine. Mitigation: `slim`-вариант, отдельные стадии сборки, в runner копируются только `dist`, `node_modules`, `prisma`.
- `engine-strict` **не включаем**: жёсткий отказ установки на другой версии Node ломает контрибьюторам onboarding сильнее, чем помогает. `engines` остаётся информирующим полем.

## Альтернативы

- **Остаться на Node 20** — поддержка заканчивается, локальная разработка уже на 24 → расхождение сред.
- **`node:24-alpine`** — меньше образ, но musl и BusyBox-специфика в healthcheck; выбран slim.
- **Fallback `|| npm install`** — скрывает рассинхрон lockfile, отвергнут.
- **`engines` без верхней границы (`>=24`)** — не защищает от мажорных несовместимостей.
- **`engine-strict=true` в `.npmrc`** — слишком агрессивно для контрибьюторов и CI-матриц.

## Ссылки

- `.nvmrc`, `package.json` (`engines`), `docker/Dockerfile`
- `.github/workflows/pr.yml`, `.github/workflows/main.yml`
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases), [`npm ci`](https://docs.npmjs.com/cli/v11/commands/npm-ci)
