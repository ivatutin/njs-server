/**
 * Реестр строковых кодов ошибок — транспортный контракт с клиентом.
 *
 * Значение из этого реестра попадает в поле `error` тела HTTP-ответа
 * (см. `AllExceptionsFilter`) и матчится клиентом **строго по строке**
 * (`matchError(err, ErrorCode.OTP_INVALID)`), а не по HTTP-статусу.
 *
 * Зеркало frontend-реестра `vue-app-base/src/shared/api/error-codes.ts`.
 * Версию контракта фиксирует `docs/auth-v1-contract.md` (сейчас v1.1).
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

  // Social / federated
  SOCIAL_AUTH_FAILED: 'SocialAuthFailed',
  PROVIDER_ACCOUNT_LINKED: 'ProviderAccountLinked',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
