export const IDENTITY_ADMIN = Symbol('IDENTITY_ADMIN');

/** Данные пользователя из Keycloak Admin API (без Keycloak-специфичных полей). */
export interface IdentityAdminUser {
  keycloakId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
}

/** Событие пользователя из Admin Events API, приведённое к доменному виду. */
export interface EmailVerificationEvent {
  keycloakId: string;
  email: string | null;
  /** Время события в Keycloak (ms since epoch). */
  time: number;
}

/**
 * Административные операции над пользователями в identity provider.
 * Отдельный порт от `IdentityProviderPort`: там — аутентификация пользователя,
 * здесь — управление его учётной записью от лица сервиса.
 */
export interface IdentityAdminPort {
  /**
   * Создаёт пользователя с паролем и required action `VERIFY_EMAIL`
   * (email считается неподтверждённым).
   * Ошибки: `ContactAlreadyExistsError` (409), `PasswordPolicyViolationError` (422).
   */
  createEmailUser(params: {
    email: string;
    password: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<{ keycloakId: string }>;

  findByEmail(email: string): Promise<IdentityAdminUser | null>;

  /** Просит Keycloak отправить письмо-подтверждение (realm SMTP). */
  sendVerifyEmail(keycloakId: string): Promise<void>;

  /** События `VERIFY_EMAIL` за последние `sinceSeconds` секунд. */
  findEmailVerificationEvents(params: { sinceSeconds: number }): Promise<EmailVerificationEvent[]>;
}
