export const IDENTITY_ADMIN = Symbol('IDENTITY_ADMIN');

/** Данные пользователя из Keycloak Admin API (без Keycloak-специфичных полей). */
export interface IdentityAdminUser {
  keycloakId: string;
  /**
   * Логин в Keycloak. У email-пользователя это email, у phone-пользователя —
   * телефон (ADR-0015), поэтому поле нужно там, где логин не выводится из
   * других данных (подтверждение пароля в reauth, привязка federated identity).
   */
  username?: string | null;
  /** Телефон из атрибутов Keycloak (`phoneNumber`), E.164. */
  phone?: string | null;
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

  /**
   * Создаёт phone-пользователя без пароля: `username` = телефон (Keycloak 26
   * резолвит username/email по `login_hint`, иначе CIBA его не найдёт),
   * атрибуты `phoneNumber`/`phoneVerified`, профиль заполнен (требование
   * user-profile в KC 26 — иначе пользователь «not fully set up»).
   * Ошибки: `ContactAlreadyExistsError` (409).
   */
  createPhoneUser(params: {
    phone: string;
    firstName: string;
    lastName: string;
  }): Promise<{ keycloakId: string }>;

  /** Поиск по username (используется, когда Keycloak не отдал `Location`). */
  findByUsername(username: string): Promise<IdentityAdminUser | null>;

  /** Пользователь по `keycloakId` (то есть по `sub` из токена). */
  findById(keycloakId: string): Promise<IdentityAdminUser | null>;

  /**
   * Устанавливает (перезаписывает) пароль пользователя.
   * Ошибки: `PasswordPolicyViolationError` (422).
   */
  setPassword(params: { keycloakId: string; password: string }): Promise<void>;

  /**
   * Гасит **все** сессии пользователя в Keycloak (refresh-токены перестают работать).
   * Шаг 1 неделимого отзыва доступа (ADR-0018) — вызывается только оттуда; ошибка не глушится в best-effort.
   */
  logoutAllSessions(keycloakId: string): Promise<void>;

  findByEmail(email: string): Promise<IdentityAdminUser | null>;

  /** Просит Keycloak отправить письмо-подтверждение (realm SMTP). */
  sendVerifyEmail(keycloakId: string): Promise<void>;

  /**
   * Просит Keycloak отправить письмо с required action `UPDATE_PASSWORD`
   * (ссылка «сменить пароль» с ограниченным временем жизни).
   */
  sendPasswordResetEmail(keycloakId: string): Promise<void>;

  /** События `VERIFY_EMAIL` за последние `sinceSeconds` секунд. */
  findEmailVerificationEvents(params: { sinceSeconds: number }): Promise<EmailVerificationEvent[]>;
}
