/**
 * Порт «создай/найди shadow-пользователя по данным identity provider».
 *
 * Нужен auth-контексту: после регистрации в Keycloak нужно вернуть клиенту
 * `UserDto` (контракт `sign-up/email`), а владелец данных — user-контекст.
 * Порт живёт в shared (как `EVENT_BUS` / `CONTACT_LOOKUP`), реализацию поставляет
 * user-модуль, поэтому импорта модуля модулем не появляется.
 */
export const USER_PROVISIONING = Symbol('USER_PROVISIONING');

/** Плоское представление пользователя для других контекстов. */
export interface ProvisionedUser {
  id: string;
  keycloakId: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProvisioning {
  /**
   * Идемпотентно создаёт локального пользователя по данным из identity provider
   * (статус `pending_verification`) и возвращает его текущее состояние.
   * Существующий пользователь не перезаписывается.
   */
  ensureFromIdentity(params: {
    keycloakId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<ProvisionedUser>;
}
