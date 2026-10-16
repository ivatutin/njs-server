import { UserNotFoundError } from '../../src/shared/domain/errors/user-not-found.error';
import { KeycloakAdminAdapter } from '../../src/modules/auth/infrastructure/keycloak/keycloak-admin.adapter';
import { KeycloakAdminClient } from '../../src/modules/auth/infrastructure/keycloak/keycloak-admin.client';

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

  return { adapter: new KeycloakAdminAdapter(client), client };
}

describe('KeycloakAdminAdapter.updateContacts', () => {
  it('клиринг телефона (`phone: null`) чистит наши атрибуты, остальное переносит', async () => {
    const { adapter, client } = build();

    await adapter.updateContacts({ keycloakId: KC_ID, phone: null, phoneVerified: false });

    expect(client.updateUser).toHaveBeenCalledWith(KC_ID, {
      email: 'user@example.com',
      emailVerified: true,
      firstName: 'Путь',
      lastName: 'Би',
      enabled: true,
      attributes: {
        phoneNumber: [],
        phoneVerified: [],
        keepMe: ['untouched'],
      },
    });
  });

  it('смена email: `PUT` получает полное представление (иначе Keycloak затрёт контакты)', async () => {
    const { adapter, client } = build();

    await adapter.updateContacts({
      keycloakId: KC_ID,
      email: 'new@example.com',
      emailVerified: true,
    });

    expect(client.updateUser).toHaveBeenCalledWith(KC_ID, {
      email: 'new@example.com',
      emailVerified: true,
      firstName: 'Путь',
      lastName: 'Би',
      enabled: true,
      attributes: {
        phoneNumber: ['+79990000124'],
        phoneVerified: ['true'],
        keepMe: ['untouched'],
      },
    });
  });

  it('пользователя в Keycloak нет — UserNotFound', async () => {
    const { adapter, client } = build(null);

    await expect(
      adapter.updateContacts({ keycloakId: KC_ID, phone: null }),
    ).rejects.toThrow(UserNotFoundError);
    expect(client.updateUser).not.toHaveBeenCalled();
  });
});
