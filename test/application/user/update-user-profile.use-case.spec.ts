import { UpdateUserProfileUseCase } from '../../../src/modules/user/application/use-cases/update-user-profile/update-user-profile.use-case';
import { UpdateUserProfileCommand } from '../../../src/modules/user/application/use-cases/update-user-profile/update-user-profile.command';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserNotFoundError } from '../../../src/modules/user/domain/errors/user-not-found.error';

describe('UpdateUserProfileUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: UpdateUserProfileUseCase;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new UpdateUserProfileUseCase(repo);
  });

  it('updates and saves', async () => {
    const u = User.create({ keycloakId: 'kc', email: 'a@b.com' });
    repo.findById.mockResolvedValue(u);
    const result = await useCase.execute(
      new UpdateUserProfileCommand(u.id.toString(), 'Jane'),
    );
    expect(result.firstName).toBe('Jane');
    expect(repo.save).toHaveBeenCalledWith(u);
  });

  it('throws when user missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute(new UpdateUserProfileCommand('11111111-1111-1111-1111-111111111111', 'X')),
    ).rejects.toThrow(UserNotFoundError);
  });
});
