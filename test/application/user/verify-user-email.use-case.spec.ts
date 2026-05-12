import { VerifyUserEmailUseCase } from '../../../src/modules/user/application/use-cases/verify-user-email/verify-user-email.use-case';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserNotFoundError } from '../../../src/modules/user/domain/errors/user-not-found.error';

describe('VerifyUserEmailUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: VerifyUserEmailUseCase;
  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new VerifyUserEmailUseCase(repo);
  });

  it('verifies and activates pending user', async () => {
    const u = User.create({ keycloakId: 'kc', email: 'a@b.com' });
    repo.findById.mockResolvedValue(u);
    const result = await useCase.execute(u.id.toString());
    expect(result.isEmailVerified()).toBe(true);
    expect(result.status.isActive()).toBe(true);
    expect(repo.save).toHaveBeenCalled();
  });

  it('throws when user not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
