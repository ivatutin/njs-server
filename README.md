# njs-server

NestJS backend application built as a **Modular Monolith** with **DDD** and **Hexagonal Architecture**. User management with **Keycloak** authentication.

> 🇷🇺 Это обучающий эталонный проект. Подробная документация и архитектурные обоснования — на русском в [`docs/DEVELOPER_GUIDE.md`](./docs/DEVELOPER_GUIDE.md).

---

## Quick start

**Requirements:** Node.js 20+, Docker Desktop.

```bash
# 1. Clone & install
git clone https://github.com/ivatutin/njs-server.git
cd njs-server
npm install

# 2. Environment
cp .env.example .env

# 3. Bring up infrastructure (Postgres, Redis, Keycloak)
docker compose up -d postgres redis keycloak

# 4. Apply DB migrations
npx prisma generate
npx prisma migrate dev

# 5. Run the app with hot reload
npm run start:dev
```

Application runs at `http://localhost:3001/api/v1`. Swagger UI at `http://localhost:3001/api/v1/docs`.

**Initial Keycloak setup** (one-time, via UI at `http://localhost:8080`) — see [Developer Guide §16](./docs/DEVELOPER_GUIDE.md#16-локальная-разработка).

---

## Stack

| | |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | NestJS 11 + TypeScript 5.9 (SWC builder) |
| Database | PostgreSQL 16 + Prisma 7 (multiSchema) |
| Cache / Blacklist | Redis 7 (ioredis) |
| Auth | Keycloak 24 (Identity Provider) |
| Validation | Zod 4 (DTO + env) |
| Logging | Pino (structured JSON) |
| Tests | Jest (106 unit tests, 95%+ coverage) |
| CI/CD | GitHub Actions → GHCR |

---

## Documentation

| What | Where |
|---|---|
| 📘 **Developer Guide** — архитектура, принципы, конвенции, FAQ (21 раздел, на русском) | [`docs/DEVELOPER_GUIDE.md`](./docs/DEVELOPER_GUIDE.md) |
| 🏛 **Architecture Decision Records** — почему такие решения приняты | [`docs/adr/`](./docs/adr/) |
| 🔌 **API Reference** — интерактивный Swagger UI | `http://localhost:3001/api/v1/docs` (running app) |
| 🤖 **CLAUDE.md** — контекст для AI-ассистента | [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) |

---

## Project structure

```
src/
├── main.ts                  # bootstrap (pino, Zod pipe, Swagger, prefix)
├── app.module.ts
├── config/                  # env validation (zod) + named configs
├── shared/                  # technical kernel (NOT business logic)
│   ├── domain/              # AggregateRoot, ValueObject, base errors
│   ├── application/         # UseCase interface, EventBus port
│   └── infrastructure/      # Prisma, Redis, EventBus impl, logger, health, filters
└── modules/                 # bounded contexts
    ├── user/                # User CRUD + lifecycle
    │   ├── domain/          # entities, VOs, events, errors, repository port
    │   ├── application/     # 9 use cases + event handler
    │   ├── infrastructure/  # Prisma adapter + mapper + error mapper
    │   └── interfaces/      # HTTP controller, Zod DTOs, mapper
    └── auth/                # Keycloak adapter + guards
        ├── domain/
        ├── application/     # 4 use cases
        ├── infrastructure/  # KeycloakAdapter, RedisTokenStore
        └── interfaces/      # AuthController, JwtAuthGuard, decorators
```

Detail and rationale: [Developer Guide §4](./docs/DEVELOPER_GUIDE.md#4-структура-проекта).

---

## Key principles

- **Bounded contexts isolated** — User and Auth never import each other directly, communicate only via domain events
- **Domain has zero framework dependencies** — `grep -r "@nestjs\|prisma" src/modules/*/domain/` returns nothing
- **Ports & adapters** — application depends on interfaces (`USER_REPOSITORY`, `IDENTITY_PROVIDER`), swapping infrastructure is trivial
- **Defense in depth** — for example, the "email or phone required" invariant is enforced at HTTP DTO, domain entity, DB CHECK constraint, and repository error mapping
- **Security by default** — all endpoints require Bearer JWT, public ones opt in via `@Public()`

---

## Commands

### Development
```bash
npm run start:dev    # hot reload via SWC
npm run build        # production build
npm start            # run from dist/
```

### Quality
```bash
npm run lint         # ESLint
npm run lint:fix     # auto-fix
npm run format       # Prettier
npm run test         # 106 unit tests
npm run test:cov     # with coverage report
```

### Database
```bash
npx prisma generate                                # regenerate TS client
npx prisma migrate dev --create-only --name <name> # create migration (no apply)
npx prisma migrate dev                             # apply
npx prisma migrate deploy                          # production
npx prisma studio                                  # web GUI
```

### Docker
```bash
docker compose up -d                               # full stack
docker compose down                                # stop
docker compose down -v                             # + remove volumes
docker compose exec app npx prisma migrate deploy  # migrate inside container
```

---

## CI/CD

- **PR check:** install → lint → test → build (see `.github/workflows/pr.yml`)
- **Main:** validation + Docker image push to `ghcr.io/ivatutin/njs-server:latest` (see `.github/workflows/main.yml`)

Image registry: [packages on GitHub](https://github.com/ivatutin?tab=packages).

---

## License

This is an educational reference project. No license specified.

---

## Contributing

Before opening a PR, ensure you've read:
1. [Developer Guide](./docs/DEVELOPER_GUIDE.md) — full context
2. [Definition of Done](./docs/DEVELOPER_GUIDE.md#19-definition-of-done) — checklist
3. [What NOT to do](./docs/DEVELOPER_GUIDE.md#20-что-не-делать) — critical anti-patterns

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`.
