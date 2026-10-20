export const IDENTITY_PROFILE = Symbol('IDENTITY_PROFILE');

/**
 * Профиль пользователя в identity provider (внешний, source of truth по имени).
 *
 * Зачем отдельный порт: имя живёт в двух системах — Keycloak и shadow-БД. Правило
 * (контракт v1.6): пишем **сначала** в Keycloak, затем в shadow; иначе ближайшая
 * синхронизация на входе (см. `OnUserSignedInHandler`) откатит правку.
 */
export interface IdentityProfilePort {
  /**
   * Меняет имя пользователя в Keycloak; `undefined` = поле не трогаем, `null` = очистить.
   *
   * Ошибки: `UserNotFoundError` (в Keycloak пользователя нет) и
   * `IdentityProfileUnavailableError` (инфраструктура недоступна — ничего не применено).
   */
  updateName(params: {
    keycloakId: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<void>;
}
