/**
 * Встроенные роли Keycloak: они есть в `realm_access.roles` каждого токена
 * (`offline_access`, `uma_authorization`, `default-roles-<realm>`) и не являются
 * нашими ролями — им нельзя попадать ни в claims, ни в `User.roles`, ни в DTO.
 *
 * Это **денлист, а не allowlist** (ADR-0020): новая роль (`manager`, `censor`,
 * `streamer`, …) должна заводиться операцией в реалме, без правок кода.
 */
export const BUILTIN_REALM_ROLES: readonly string[] = ['offline_access', 'uma_authorization'];

/** Составная встроенная роль реалма: `default-roles-<realm>`. */
export const DEFAULT_ROLES_PREFIX = 'default-roles-';

/**
 * Убирает встроенные роли из списка ролей токена.
 *
 * Тот же денлист продублирован в миграции `20261015170000_clean_builtin_roles`
 * (разовая чистка уже сохранённых `user.users.roles`) — при правке списка обновите оба места.
 */
export function filterBuiltinRealmRoles(roles: readonly string[]): string[] {
  return roles.filter(
    (role) => !BUILTIN_REALM_ROLES.includes(role) && !role.startsWith(DEFAULT_ROLES_PREFIX),
  );
}
