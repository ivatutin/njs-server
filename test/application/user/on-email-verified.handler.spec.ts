import { OnEmailVerifiedHandler } from '../../../src/modules/user/application/event-handlers/on-email-verified.handler';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';

function pendingUser(): User {
  return User.create({ keycloakId: 'kc-1', email: 'new@example.com' });
}

describe('OnEmailVerifiedHandler', () => {
  let userRepo: jest.Mocked<UserRepository>;
  let handler: OnEmailVerifiedHandler;

  beforeEach(() => {
    userRepo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
    };
    handler = new OnEmailVerifiedHandler(userRepo);
  });

  it('marks the pending user verified and activates it', async () => {
    const user = pendingUser();
    user.pullDomainEvents();
    userRepo.findByKeycloakId.mockResolvedValue(user);

    await handler.handle({ payload: { keycloakId: 'kc-1', email: 'new@example.com' } });

    expect(user.isEmailVerified()).toBe(true);
    expect(user.status.getValue()).toBe('active');
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });

  it('is idempotent for an already verified user', async () => {
    const user = pendingUser();
    user.verifyEmail();
    user.pullDomainEvents();
    userRepo.findByKeycloakId.mockResolvedValue(user);

    await handler.handle({ payload: { keycloakId: 'kc-1', email: null } });

    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('does nothing when there is no local user yet', async () => {
    userRepo.findByKeycloakId.mockResolvedValue(null);

    await expect(
      handler.handle({ payload: { keycloakId: 'kc-unknown', email: null } }),
    ).resolves.toBeUndefined();
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});
