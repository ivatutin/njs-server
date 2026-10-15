import {
  BUILTIN_REALM_ROLES,
  DEFAULT_ROLES_PREFIX,
  filterBuiltinRealmRoles,
} from '../../src/modules/auth/infrastructure/keycloak/realm-roles';

describe('filterBuiltinRealmRoles (ADR-0020)', () => {
  it('выбрасывает встроенные роли и оставляет наши', () => {
    expect(
      filterBuiltinRealmRoles([
        'offline_access',
        'uma_authorization',
        `${DEFAULT_ROLES_PREFIX}app`,
        'admin',
      ]),
    ).toEqual(['admin']);
  });

  it('оставляет роли, заведённые в реалме (денлист, а не allowlist)', () => {
    expect(filterBuiltinRealmRoles(['streamer', 'censor', 'manager'])).toEqual([
      'streamer',
      'censor',
      'manager',
    ]);
  });

  it('каждая роль из денлиста действительно отфильтровывается', () => {
    for (const role of BUILTIN_REALM_ROLES) {
      expect(filterBuiltinRealmRoles(['admin', role])).toEqual(['admin']);
    }
  });

  it('пустой список ролей остаётся пустым', () => {
    expect(filterBuiltinRealmRoles([])).toEqual([]);
  });
});
