Шаг 1. Hello World — голый NestJS
npm init -y
Установить @nestjs/core, @nestjs/common, @nestjs/platform-express, reflect-metadata, rxjs + dev: typescript, @nestjs/cli, ts-node, @types/node
Создать tsconfig.json (с path aliases @shared/*, @modules/*, @config/*)
Создать tsconfig.build.json, nest-cli.json
Создать src/main.ts, src/app.module.ts, src/app.controller.ts
Добавить скрипты build, start, start:dev в package.json
Проверка: npm run start:dev → http://localhost:3000 → Hello World

-------------------------------------
1.1 Инициализация проекта
cd C:/WORK/VIM/WORK/_MY/nodejs-server/project
npm init -y

1.2 Установка зависимостей
npm install @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs
npm install -D typescript @nestjs/cli ts-node @types/node

1.3 Создание tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "rootDir": "./src",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@modules/*": ["./src/modules/*"],
      "@config/*": ["./src/config/*"]
    }
  }
}

1.4 Создание tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}

1.5 nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}

1.6 Создание файлов приложения
src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  console.log('App running on http://localhost:3000');
}
bootstrap();

src/app.module.ts

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
})
export class AppModule {}

src/app.controller.ts

import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Hello World';
  }
}

1.7 Добавить скрипты в package.json
"scripts": {
  "build": "nest build",
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:debug": "nest start --debug --watch"
}

Проверка шага 1
npm run start:dev

Открыть http://localhost:3000 — должен вернуть Hello World.
-------------------------------------

Шаг 2. Структура каталогов + .gitignore
mkdir -p для всех папок: shared/, modules/user/, modules/auth/, config/, docker/, .github/workflows/, test/
Создать .gitignore
Проверка: find src -type d | sort + приложение работает

Шаг 3. Shared Domain — базовые абстракции
src/shared/domain/domain-event.ts — интерфейс DomainEvent
src/shared/domain/entity.ts — базовый Entity<TId>
src/shared/domain/aggregate-root.ts — AggregateRoot с addDomainEvent/pullDomainEvents
src/shared/domain/value-object.ts — базовый ValueObject<T>
Проверка: 0 импортов @nestjs/* в shared/domain/, npm run build ОК

Шаг 4. Event Bus — интерфейс + in-memory
src/shared/application/event-bus.interface.ts — порт (EVENT_BUS Symbol + интерфейс)
src/shared/infrastructure/event-bus/in-memory-event-bus.ts — реализация (Map + handlers)
src/shared/infrastructure/event-bus/event-bus.module.ts — @Global модуль
Подключить EventBusModule в app.module.ts
Проверка: npm run build + npm run start:dev работает

Шаг 5. User Domain — сущность, value objects, события
Value objects: UserId, Email, Phone, UserStatus
Events: UserCreatedEvent, UserUpdatedEvent
Entity: User (AggregateRoot) — фабричный create(), reconstitute(), бизнес-методы
Port: UserRepository (интерфейс + Symbol)
Добавить jest moduleNameMapper для path aliases
Проверка: npm run build ОК, домен чист от фреймворка

Шаг 6. Config module + .env
npm install @nestjs/config zod
.env.example → .env
src/config/env.validation.ts (zod), app.config.ts, database.config.ts, redis.config.ts, keycloak.config.ts
ConfigModule.forRoot() в app.module.ts
Порт из конфига в main.ts, app.setGlobalPrefix('api')
Проверка: http://localhost:3000/api → Hello World, удалить DATABASE_URL → crash

Шаг 7. Prisma — подключение PostgreSQL
npm install @prisma/client + dev: prisma, npx prisma init
prisma/schema.prisma с multiSchema (user)
src/shared/infrastructure/prisma/prisma.service.ts + prisma.module.ts (@Global)
Запустить PostgreSQL (Docker), создать schema user, npx prisma migrate dev --name init
Проверка: таблица user.users существует, приложение стартует

Шаг 8. User Infrastructure — репозиторий + маппер
src/modules/user/infrastructure/persistence/user.mapper.ts — PrismaUser ↔ User domain
src/modules/user/infrastructure/persistence/prisma-user.repository.ts — implements UserRepository
Проверка: npm run build ОК

Шаг 9. User Application — use cases
src/shared/application/use-case.interface.ts
Use cases: CreateUser, GetUserById, UpdateUser, DeleteUser (command + use-case)
Проверка: npm run build ОК

Шаг 10. User Interfaces — контроллер, DTO, модуль
npm install class-validator class-transformer
DTO: CreateUserDto, UpdateUserDto, UserResponseDto
UserHttpMapper, UserController
UserModule (exports: [] — изоляция)
ValidationPipe в main.ts
Проверка: CRUD через curl работает (POST/GET/PUT/DELETE /api/users)

Шаг 11. Health endpoint
npm install @nestjs/terminus
HealthController + HealthModule
Проверка: curl /api/health → { status: "ok" }

Шаг 12. Structured logging (pino)
npm install nestjs-pino pino-http pino + dev: pino-pretty
AppLoggerModule — JSON в prod, pretty в dev
app.useLogger(app.get(Logger)) в main.ts
Проверка: логи структурированные

Шаг 13. Exception filter
src/shared/infrastructure/filters/all-exceptions.filter.ts
app.useGlobalFilters() в main.ts
Проверка: ошибки возвращаются в формате { statusCode, timestamp, path, message }

Шаг 14. Docker
.dockerignore
docker/Dockerfile — multi-stage (deps → build → runner, non-root, healthcheck)
docker/postgres-init.sql — создаёт БД keycloak + schema user
docker-compose.yml — postgres, redis, keycloak, app (healthchecks, volumes, network)
docker-compose.prod.yml — override для prod
Проверка: docker compose up -d → все сервисы healthy

Шаг 15. Auth module — Keycloak adapter
Ports: IdentityProviderPort, TokenStorePort
Event: UserSignedInEvent
Keycloak adapter: KeycloakHttpClient, KeycloakJwtVerifier, KeycloakAdapter
RedisTokenStore (in-memory заглушка на первой итерации)
Use cases: SignIn, ValidateToken, RefreshToken, SignOut
Guards: JwtAuthGuard (global APP_GUARD), RolesGuard
Decorators: @Public(), @CurrentUser(), @Roles()
Controller: AuthController (/auth/sign-in, /auth/refresh, /auth/sign-out)
Event handler: OnUserSignedInHandler в User module — auto-create user при sign-in
Проверка: sign-in → токен, User создан в БД, protected routes работают

Шаг 16. CI/CD — GitHub Actions
.github/workflows/pr.yml — lint + test + build
.github/workflows/main.yml — + docker build/push в GHCR
Установить ESLint + Prettier + конфиги
Проверка: npm run lint && npm run test && npm run build

Шаг 17. Unit тесты
test/user/user.entity.spec.ts — создание, события, инварианты
Проверка: npm run test зелёный
