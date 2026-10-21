import { Logger } from '@nestjs/common';
import { KeycloakAdminClient } from '../../src/shared/infrastructure/keycloak/keycloak-admin.client';
import { KeycloakIdentityProfileAdapter } from '../../src/modules/user/infrastructure/keycloak/keycloak-identity-profile.adapter';
import { IdentityProfileUnavailableError } from '../../src/modules/user/domain/errors/identity-profile-unavailable.error';
import { UserNotFoundError } from '../../src/shared/domain/errors/user-not-found.error';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

function currentUser(overrides: Record<string, unknown> = {}) {
  return {
    id: KC_ID,
    username: 'usr_0123456789abcdef',
    email: 'user@example.com',
    emailVerified: true,
    firstName: 'Путь',
    lastName: 'Би',
    enabled: true,
    requiredActions: ['VERIFY_EMAIL'],
    attributes: {
      phoneNumber: ['+79990000124'],
      phoneVerified: ['true'],
      keepMe: ['untouched'],
    },
    ...overrides,
  };
}

function build(user: Record<string, unknown> | null = currentUser()) {
  const client = {
    findUserById: jest.fn().mockResolvedValue(user),
    updateUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<KeycloakAdminClient>;

  return { adapter: new KeycloakIdentityProfileAdapter(client), client };
}

describe('KeycloakIdentityProfileAdapter.updateName', () => {
  it('PUT получает полное представление: username, атрибуты и requiredActions сохраняются', async () => {
    const { adapter, client } = build();

    await adapter.updateName({ keycloakId: KC_ID, firstName: 'Jane' });

    expect(client.updateUser).toHaveBeenCalledTimes(1);
    const [id, representation] = (client.updateUser as jest.Mock).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe(KC_ID);
    expect(representation.firstName).toBe('Jane');
    // не переданное поле остаётся прежним
    expect(representation.lastName).toBe('Би');
    // `PUT` — полная замена: всё прочитанное должно уехать обратно
    expect(representation).toMatchObject({
      username: 'usr_0123456789abcdef',
      email: 'user@example.com',
      emailVerified: true,
      enabled: true,
      requiredActions: ['VERIFY_EMAIL'],
      attributes: {
        phoneNumber: ['+79990000124'],
        phoneVerified: ['true'],
        keepMe: ['untouched'],
      },
    });
  });

  it('`null` очищает имя (источник истины — Keycloak, контракт v1.6)', async () => {
    const { adapter, client } = build();

    await adapter.updateName({ keycloakId: KC_ID, firstName: null, lastName: null });

    const [, representation] = (client.updateUser as jest.Mock).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // batch-5: в теле — пустые строки, не `null` (иначе profile-валидатор роли `user` даёт 400)
    expect(representation.firstName).toBe('');
    expect(representation.lastName).toBe('');
  });

  it('«пустой» профиль: только firstName → второе имя уходит пустой строкой, а не null (batch-5)', async () => {
    const { adapter, client } = build(currentUser({ firstName: undefined, lastName: undefined }));

    await adapter.updateName({ keycloakId: KC_ID, firstName: 'Jane' });

    const [, representation] = (client.updateUser as jest.Mock).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(representation.firstName).toBe('Jane');
    expect(representation.lastName).toBe('');
    expect(JSON.stringify(representation)).not.toContain('null');
  });

  it('тело ответа Keycloak попадает в лог (batch-5: раньше терялось)', async () => {
    const { adapter, client } = build();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    (client.updateUser as jest.Mock).mockRejectedValue({
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: { error: 'error-user-attribute-required', errorMessage: 'User attribute is required' },
      },
    });

    await expect(adapter.updateName({ keycloakId: KC_ID, firstName: 'Jane' })).rejects.toBeInstanceOf(
      IdentityProfileUnavailableError,
    );

    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[status 400]');
    expect(logged).toContain('error-user-attribute-required');
    expect(logged).toContain('firstName=set');
    // значения имён (PII) в лог не попадают
    expect(logged).not.toContain('Jane');

    warn.mockRestore();
  });

  it('пользователя нет в Keycloak → UserNotFound, записи нет', async () => {
    const { adapter, client } = build(null);

    await expect(adapter.updateName({ keycloakId: KC_ID, firstName: 'Jane' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it('Keycloak недоступен на чтении → 503, записи нет', async () => {
    const { adapter, client } = build();
    (client.findUserById as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(adapter.updateName({ keycloakId: KC_ID, firstName: 'Jane' })).rejects.toBeInstanceOf(
      IdentityProfileUnavailableError,
    );
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it('Keycloak недоступен на записи → 503', async () => {
    const { adapter, client } = build();
    (client.updateUser as jest.Mock).mockRejectedValue(new Error('503 Service Unavailable'));

    await expect(adapter.updateName({ keycloakId: KC_ID, firstName: 'Jane' })).rejects.toBeInstanceOf(
      IdentityProfileUnavailableError,
    );
  });
});
