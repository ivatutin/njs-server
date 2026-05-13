# ADR 0007: SWC builder вместо tsc для сборки

- **Дата:** 2026-04-13
- **Статус:** Accepted

## Контекст

NestJS CLI поддерживает три builder'а:
1. **tsc** (TypeScript compiler) — стандарт по умолчанию
2. **webpack** — bundler
3. **SWC** (Speedy Web Compiler, Rust) — быстрый компилятор

При работе с **NestJS 11 + TypeScript 5.9 + Prisma 7** и hot-reload (`nest start --watch`) производительность сборки ощутимо влияет на DX.

## Решение

Используем **SWC** в `nest-cli.json`:
```json
{
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true
  }
}
```

Type-check сохраняется через параметр `typeCheck: true` — Nest CLI запускает `tsc --noEmit` отдельно, а компиляция идёт через SWC.

## Последствия

### Положительные

- **Скорость сборки в 5-10 раз быстрее.** На нашем проекте (~112 файлов) полная сборка: ~300-500ms с SWC vs 3-5 сек с tsc.
- **Быстрая инкрементальная сборка** в watch mode — изменение одного файла обновляется почти мгновенно.
- **Type safety сохраняется** через `typeCheck: true` (tsc запускается параллельно).
- **Без зависимости от webpack** — webpack добавляет конфигурацию и накладные расходы.

### Отрицательные

- **Платформенно-зависимые binaries.** `@swc/core` имеет нативные binaries для каждой OS (`@swc/core-win32-x64-msvc`, `@swc/core-linux-x64-gnu`). При установке через `npm install` — корректные для текущей платформы.
  - **Проблема:** `package-lock.json` сгенерированный на Windows не имеет Linux binaries, и `npm ci` в Docker (Linux) падает.
  - **Mitigation:** в Dockerfile используем `npm install` (не `npm ci`), либо генерим lock на Linux машине.

- **Quirk с Prisma 7 generated client.** На Linux SWC иногда добавляет `.ts` extension в `require()` для соседних `.ts` файлов в `src/generated/prisma/`:
  ```js
  require('./internal/class.ts')  // ✗ не работает в runtime
  ```
  На Windows того же кода не происходит. **Mitigation:** sed post-process в Dockerfile:
  ```dockerfile
  RUN npm run build && \
      find dist/generated -name "*.js" -exec sed -i 's/\.ts")/")/g' {} +
  ```

- **chokidar обязателен** для `--watch` режима (SWC сам не имеет file watcher).

- **Меньше документации** в NestJS-сообществе чем для tsc. Большинство туториалов предполагают tsc.

## Альтернативы

### tsc по умолчанию (отвергнуто)

NestJS CLI по умолчанию использует tsc.

**Почему нет:**
- Медленно. Особенно в watch mode на больших проектах
- На NestJS 11 + tsc + watch есть известные проблемы (некорректное удаление dist между перекомпиляциями) — мы это наблюдали на первом шаге проекта

### webpack (отвергнуто)

NestJS поддерживает webpack как builder.

**Почему нет:**
- Сложная конфигурация
- Tree shaking для backend не критичен (один bundle, не нужно оптимизировать размер для CDN)
- Webpack 5 на NestJS медленнее SWC

### esbuild (не пробовали)

Очень быстрый, как и SWC. Не поддерживается NestJS CLI напрямую, нужна custom-конфигурация.

**Почему нет на этом этапе:** SWC уже даёт нужную скорость, integration с Nest CLI готовая.

## Конфигурация (текущая)

`nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "builder": "swc",
    "typeCheck": true
  }
}
```

Зависимости в `devDependencies`:
- `@swc/cli`
- `@swc/core`
- `chokidar` (для watch)

## Когда пересмотреть

- SWC станет «mainline» в Nest CLI (`builder: tsc` deprecated) → ничего менять не нужно, мы уже на SWC
- Появится esbuild integration в Nest CLI с лучшей перформенс → возможно мигрировать
- Будут постоянные баги в SWC с TS feature → вернуться к tsc, потерять скорость

## Ссылки

- [NestJS — SWC builder](https://docs.nestjs.com/recipes/swc)
- [SWC project](https://swc.rs/)
- [Performance benchmarks: SWC vs tsc vs Babel](https://swc.rs/docs/benchmarks)
