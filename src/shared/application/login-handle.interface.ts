/**
 * Порт «единый резолвер: идентификатор → логин для Keycloak» (ADR-0017 ред.2, путь B).
 *
 * После перехода на путь B `username` в Keycloak — это стабильный `handle` (не контакт), поэтому все места,
 * где мы передаём логин в Keycloak (password-grant в `sign-in`/`reauth`, `login_hint` в CIBA), обязаны
 * получать его отсюда, а не из телефона/email.
 *
 * Владелец данных — user-контекст, поэтому порт живёт в shared kernel (как `CONTACT_LOOKUP`),
 * а реализацию поставляет user-модуль: импортов «модуль → модуль» нет.
 *
 * `null` означает «handle неизвестен» — вызывающая сторона решает сама (например, для входа по email
 * допустим фолбэк на сам email: `loginWithEmailAllowed=true` резолвит его по атрибуту).
 */
export const LOGIN_HANDLE_RESOLVER = Symbol('LOGIN_HANDLE_RESOLVER');

export interface LoginHandleResolver {
  /** @param phone телефон в формате E.164 */
  byPhone(phone: string): Promise<string | null>;

  /** @param email email в нижнем регистре */
  byEmail(email: string): Promise<string | null>;

  /** @param keycloakId `sub` пользователя (для защищённых операций: reauth, смена пароля). */
  byKeycloakId(keycloakId: string): Promise<string | null>;
}
