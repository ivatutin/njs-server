# ADR 0004: Keycloak как Identity Provider

- **Дата:** 2026-04-13
- **Статус:** Accepted

## Контекст

Нужна аутентификация пользователей. На входе:
- Хранение паролей (с правильным hashing, salt, etc.)
- Email/SMS verification flows
- Password reset flows
- Token issuance (JWT) с подписью и валидацией
- Refresh token rotation
- Multi-factor auth (на перспективу)
- Social logins (на перспективу — Google, GitHub)

Варианты:

1. **Roll your own** — passport.js + bcrypt + JWT библиотека
2. **Keycloak** — open-source Identity Provider (Red Hat)
3. **Auth0** / **Clerk** / **Supabase Auth** — managed cloud services
4. **AWS Cognito** / **Azure AD B2C** — cloud-specific
5. **Ory Kratos** — open-source, более новый

## Решение

Используем **Keycloak 24** как внешний Identity Provider, через паттерн **Adapter** (см. [ADR 0002](./0002-hexagonal-architecture.md)).

Конкретные технические решения:

- **Direct Access Grants** (password grant) для sign-in — простой flow для backend-приложения с собственным фронтендом
- **JWT** access tokens, **JWKS** для верификации (`jwks-rsa` библиотека с кэшем)
- **Refresh tokens** revoke на стороне Keycloak при sign-out
- **Access token blacklist** в Redis с TTL = remaining JWT lifetime (Keycloak не инвалидирует access JWT после revoke refresh token)

## Архитектурный приём

`IdentityProviderPort` (domain `auth/`) — интерфейс из 4 методов:
```ts
interface IdentityProviderPort {
  signIn(email, password): Promise<TokenPair>;
  refresh(refreshToken): Promise<TokenPair>;
  signOut(refreshToken): Promise<void>;
  verifyAccessToken(token): Promise<TokenClaims>;
}
```

`KeycloakAdapter` (infrastructure) реализует этот порт. **Никаких других файлов в коде не знают о Keycloak** — все упоминания Keycloak инкапсулированы в:
- `auth/infrastructure/keycloak/keycloak-http.client.ts`
- `auth/infrastructure/keycloak/keycloak-jwt.verifier.ts`
- `auth/infrastructure/keycloak/keycloak.adapter.ts`

User module, controllers, use cases видят только `IdentityProviderPort` через DI токен `IDENTITY_PROVIDER`.

## Последствия

### Положительные

- **Зрелый продукт.** Keycloak >10 лет на рынке (RH SSO). Покрывает 99% потребностей в IAM.
- **Open source + self-hosted.** Никакого vendor lock-in, никаких per-user ставок. Можно держать у себя.
- **Богатый функционал:**
  - Realms (изоляция окружений / клиентов)
  - Clients (mobile / web / server-to-server)
  - Roles + Groups + composite roles
  - Identity Brokering (Google, GitHub, LDAP, AD)
  - Built-in UI для admin и для пользователя (account console, password reset)
  - Themes (можно стилизовать login страницу)
  - Audit logs
  - Webhooks (Event Listeners SPI)
- **Standard-compliant.** OpenID Connect, OAuth 2.0, SAML 2.0 — можно подключать любые клиенты.
- **Сильная изоляция через port pattern.** Если завтра решим перейти на Auth0, нужно написать `Auth0Adapter implements IdentityProviderPort` — ноль изменений в use cases и controllers.

### Отрицательные

- **Зависимость Java.** Keycloak — Java/Quarkus приложение. Нужен JDK в Docker, конфигурация в Java стиле (KC_DB_URL, KC_HOSTNAME, etc).
- **Память.** Keycloak требует ~512 MB RAM на старте. Для dev-среды это не блокер, но в проде учитывается.
- **Сложность конфигурации.** Realms, clients, mappers — есть кривая обучения. Первоначальный setup делается через UI (или Realm Export JSON).
- **Производственный режим требует подготовки.** `start-dev` (что мы используем локально) ≠ `start --optimized` (prod). В прод нужно: pre-build, `KC_HOSTNAME`, HTTPS termination, отдельная Postgres БД.
- **Размер Docker-образа.** ~700 MB (vs ~200 MB у managed Auth0 SDK).

## Альтернативы

### Roll your own — passport.js + bcrypt + JWT (отвергнуто)

Минимальный стек для аутентификации.

**Почему нет:**
- Hashing паролей, salt, password policies, brute-force защита, email verification flows, password reset — всё это надо самому
- Высокая поверхность атаки и риск ошибок в безопасности
- Для one-off проекта может быть приемлемо, для серьёзного backend — антипаттерн в 2026 году

### Auth0 / Clerk / Supabase Auth (отвергнуто)

Managed cloud services с great DX.

**Почему нет:**
- **Vendor lock-in** на конкретного провайдера
- **Стоимость** — обычно per-user pricing, при росте может быть существенно (Auth0: $240/month на 1000 active users + premium features)
- **Регуляторные риски** — для проектов с требованием data residency (РФ, EU GDPR) нельзя хранить identity data в США
- **Зависимость от внешнего сервиса** — если Auth0 ляжет, наш sign-in не работает

### AWS Cognito (отвергнуто)

Managed IAM сервис в AWS.

**Почему нет:**
- Сильный vendor lock-in на AWS
- Сложный DX (UI неудобный, customization ограничен)
- Хороший выбор **если уже на AWS**, иначе — лучше другие варианты

### Ory Kratos (отвергнуто на этом этапе)

Open-source, modern, headless (API-only, без built-in UI).

**Почему нет:**
- Headless = нужно писать свою login UI с нуля (Keycloak даёт встроенную)
- Меньшая распространённость, меньше готовых интеграций
- Возможный пересмотр позже, если потребуется тонкая кастомизация UX

## Что в Keycloak vs в нашей БД

| Что | Где |
|---|---|
| Логин / пароль | Keycloak |
| Email verification flow | Keycloak |
| Password reset | Keycloak |
| MFA settings | Keycloak |
| Roles, group memberships | Keycloak (синхронизируется к нам в `roles` поле) |
| Refresh tokens, sessions | Keycloak |
| Access token blacklist | **Наш Redis** (Keycloak не инвалидирует JWT после revoke refresh — это известная особенность OAuth2) |
| Профиль (firstName, lastName, metadata) | **Наша БД** (Keycloak имеет profile, но мы синхронизируем) |
| Бизнес-данные | **Наша БД** (никогда в Keycloak) |

## Setup

Подробный пошаговый setup в [Developer Guide §16](../DEVELOPER_GUIDE.md#16-локальная-разработка). Кратко:

1. Realm `app`
2. Client `app-backend` (confidential, Direct Access Grants ON)
3. Client Secret → в `.env` → `KEYCLOAK_CLIENT_SECRET`
4. Тестовый user с verified email и постоянным паролем

В будущем — экспортировать realm в `docker/keycloak/realm-export.json` и подкладывать в контейнер, чтобы setup был автоматическим.

## Ссылки

- [Keycloak documentation](https://www.keycloak.org/documentation)
- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [Auth0 vs Keycloak comparison](https://medium.com/keycloak/keycloak-vs-auth0-a-quick-comparison-cf9b9eddebc1)
