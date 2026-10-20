/**
 * Реестр строковых кодов ошибок — транспортный контракт с клиентом.
 *
 * Значение из этого реестра попадает в поле `error` тела HTTP-ответа
 * (см. `AllExceptionsFilter`) и матчится клиентом **строго по строке**
 * (`matchError(err, ErrorCode.OTP_INVALID)`), а не по HTTP-статусу.
 *
 * Зеркало frontend-реестра `vue-app-base/src/shared/api/error-codes.ts`.
 * Версию контракта фиксирует `docs/auth-v1-contract.md` (в работе — **v1.4**; актуальную версию всегда смотри в шапке
 * того файла: эта строка один раз уже устарела — ровно так и появляются «сверенные по памяти» расхождения).
 * Актуальная версия на 20.10.2026 — **v1.6**.
 *
 * Правила (совпадают с «Протокол расширения контракта ошибок» в контракте):
 * - имя — PascalCase без суффикса `Error`, схема `<Домен><Условие>`;
 * - один код = один HTTP-статус; если у кода есть `details`, форма описана;
 * - `DomainError.code` берёт значение отсюда, если код есть в реестре;
 * - новый код добавляется **в оба зеркальных реестра** (бэкенд + фронт):
 *   добавление аддитивно (клиент не ломается на неизвестном коде), а
 *   переименование или смена смысла — ломающее изменение контракта.
 */
export const ErrorCode = {
  // Auth / credentials
  INVALID_CREDENTIALS: 'InvalidCredentials',
  INVALID_TOKEN: 'InvalidToken', // v1.1: невалидный/просроченный/отозванный access или refresh

  // Users
  USER_NOT_FOUND: 'UserNotFound', // v1.1: пользователь не найден (404)

  // Contacts
  CONTACT_ALREADY_EXISTS: 'ContactAlreadyExists',
  CONTACT_NOT_FOUND: 'ContactNotFound',
  CONTACT_ALREADY_VERIFIED: 'ContactAlreadyVerified',
  INVALID_CONTACTS: 'InvalidContacts', // v1.1: нарушен инвариант контактов (422)

  // OTP
  OTP_INVALID: 'OtpInvalid',
  OTP_EXPIRED: 'OtpExpired',
  OTP_TOO_MANY_ATTEMPTS: 'OtpTooManyAttempts',
  OTP_RATE_LIMITED: 'OtpRateLimited',

  // Tokens
  VERIFICATION_TOKEN_INVALID: 'VerificationTokenInvalid',
  VERIFICATION_TOKEN_EXPIRED: 'VerificationTokenExpired',
  CHANGE_TOKEN_EXPIRED: 'ChangeTokenExpired',
  REAUTH_TOKEN_INVALID: 'ReauthTokenInvalid',
  REAUTH_TOKEN_EXPIRED: 'ReauthTokenExpired',

  // Business rules
  CONTACT_CHANGE_ALREADY_PENDING: 'ContactChangeAlreadyPending',
  PASSWORD_POLICY_VIOLATION: 'PasswordPolicyViolation',
  TERMS_NOT_ACCEPTED: 'TermsNotAccepted',

  // Транспорт / инфраструктура
  // v1.5: не хватает роли для эндпоинта (403). Отдаёт `RolesGuard` с ввода RBAC (ADR-0020),
  // в реестре его не было — клиент не мог матчить 403 и обрабатывал «по статусу».
  FORBIDDEN: 'Forbidden',
  // v1.6: отказ инфраструктуры без доменного смысла (503) — Keycloak/провайдер недоступен.
  // Строку отдаёт NestJS (`ServiceUnavailableException`), до v1.6 клиент ловил только по статусу.
  SERVICE_UNAVAILABLE: 'Service Unavailable',

  // Social / federated
  SOCIAL_AUTH_FAILED: 'SocialAuthFailed',
  PROVIDER_ACCOUNT_LINKED: 'ProviderAccountLinked',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
