import { OnUserSignedInHandler } from '../../../src/modules/user/application/event-handlers/on-user-signed-in.handler';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';

const event = (payload: {
  keycloakId: string;
  email: string;
  roles: string[];
  firstName?: string | null;
  lastName?: string | null;
}) => ({
  eventName: 'auth.user-signed-in',
  occurredOn: new Date(),
  payload,
});

describe('OnUserSignedInHandler', () => {
  let repo: jest.Mocked<UserRepository>;
  let handler: OnUserSignedInHandler;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
    };
    handler = new OnUserSignedInHandler(repo);
  });

  it('creates new active user on first sign-in', async () => {
    repo.findByKeycloakId.mockResolvedValue(null);
    await handler.handle(event({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['user'] }));
    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = (repo.save as jest.Mock).mock.calls[0][0] as User;
    expect(saved.email?.toString()).toBe('a@b.com');
    expect(saved.isEmailVerified()).toBe(true);
    expect(saved.status.isActive()).toBe(true);
    expect(saved.roles).toEqual(['user']);
  });

  it('does not save on repeat sign-in with same roles', async () => {
    const existing = User.create({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['user'] });
    existing.verifyEmail();
    repo.findByKeycloakId.mockResolvedValue(existing);
    await handler.handle(event({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['user'] }));
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('syncs roles on change', async () => {
    const existing = User.create({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['user'] });
    existing.verifyEmail();
    repo.findByKeycloakId.mockResolvedValue(existing);
    await handler.handle(event({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['admin'] }));
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(existing.roles).toEqual(['admin']);
  });

  it('treats role order as no-change', async () => {
    const existing = User.create({
      keycloakId: 'kc-1',
      email: 'a@b.com',
      roles: ['a', 'b'],
    });
    existing.verifyEmail();
    repo.findByKeycloakId.mockResolvedValue(existing);
    await handler.handle(event({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['b', 'a'] }));
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('logs warning on email drift without sync', async () => {
    const existing = User.create({ keycloakId: 'kc-1', email: 'old@b.com', roles: [] });
    existing.verifyEmail();
    repo.findByKeycloakId.mockResolvedValue(existing);
    await handler.handle(event({ keycloakId: 'kc-1', email: 'new@b.com', roles: [] }));
    // email is NOT updated because verified contact change is not implemented here
    expect(existing.email?.toString()).toBe('old@b.com');
  });

  // --- Синхронизация имени (контракт v1.6, batch-4 п.2) ---

  it('создаёт пользователя сразу с именем из Keycloak (первый вход)', async () => {
    repo.findByKeycloakId.mockResolvedValue(null);

    await handler.handle(
      event({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        roles: ['user'],
        firstName: 'Jane',
        lastName: 'Doe',
      }),
    );

    const saved = (repo.save as jest.Mock).mock.calls[0][0] as User;
    expect(saved.firstName).toBe('Jane');
    expect(saved.lastName).toBe('Doe');
  });

  it('досинхронизирует изменившееся имя при повторном входе', async () => {
    const existing = User.create({
      keycloakId: 'kc-1',
      email: 'a@b.com',
      roles: ['user'],
      firstName: 'Old',
      lastName: 'Name',
    });
    existing.verifyEmail();
    repo.findByKeycloakId.mockResolvedValue(existing);

    await handler.handle(
      event({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        roles: ['user'],
        firstName: 'Jane',
        lastName: 'Name',
      }),
    );

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(existing.firstName).toBe('Jane');
    expect(existing.lastName).toBe('Name');
  });

  it('не трогает имя, если в событии его нет (undefined = не передано)', async () => {
    const existing = User.create({
      keycloakId: 'kc-1',
      email: 'a@b.com',
      roles: ['user'],
      firstName: 'Jane',
      lastName: 'Doe',
    });
    existing.verifyEmail();
    repo.findByKeycloakId.mockResolvedValue(existing);

    await handler.handle(event({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['user'] }));

    expect(repo.save).not.toHaveBeenCalled();
    expect(existing.firstName).toBe('Jane');
  });

  it('очищает имя, если в Keycloak его больше нет (null = пусто)', async () => {
    const existing = User.create({
      keycloakId: 'kc-1',
      email: 'a@b.com',
      roles: ['user'],
      firstName: 'Jane',
      lastName: 'Doe',
    });
    existing.verifyEmail();
    repo.findByKeycloakId.mockResolvedValue(existing);

    await handler.handle(
      event({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        roles: ['user'],
        firstName: null,
        lastName: null,
      }),
    );

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(existing.firstName).toBeNull();
    expect(existing.lastName).toBeNull();
  });

  it('одна запись, если изменились и имя, и роли', async () => {
    const existing = User.create({
      keycloakId: 'kc-1',
      email: 'a@b.com',
      roles: ['user'],
      firstName: 'Old',
    });
    existing.verifyEmail();
    repo.findByKeycloakId.mockResolvedValue(existing);

    await handler.handle(
      event({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        roles: ['admin'],
        firstName: 'Jane',
      }),
    );

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(existing.firstName).toBe('Jane');
    expect(existing.roles).toEqual(['admin']);
  });
});
