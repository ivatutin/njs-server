import { GetUserByIdUseCase } from '../../../src/modules/user/application/use-cases/get-user-by-id/get-user-by-id.use-case';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserNotFoundError } from '../../../src/modules/user/domain/errors/user-not-found.error';

describe('GetUserByIdUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: GetUserByIdUseCase;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new GetUserByIdUseCase(repo);
  });

  it('returns user when found', async () => {
    const u = User.create({ keycloakId: 'kc', email: 'a@b.com' });
    repo.findById.mockResolvedValue(u);
    const result = await useCase.execute(u.id.toString());
    expect(result).toBe(u);
  });

  it('throws UserNotFoundError when not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
