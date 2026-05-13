import { GetUserByKeycloakIdUseCase } from '../../../src/modules/user/application/use-cases/get-user-by-keycloak-id/get-user-by-keycloak-id.use-case';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserNotFoundError } from '../../../src/modules/user/domain/errors/user-not-found.error';

describe('GetUserByKeycloakIdUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: GetUserByKeycloakIdUseCase;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new GetUserByKeycloakIdUseCase(repo);
  });

  it('returns user when found', async () => {
    const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
    repo.findByKeycloakId.mockResolvedValue(u);
    const result = await useCase.execute('kc-1');
    expect(result).toBe(u);
    expect(repo.findByKeycloakId).toHaveBeenCalledWith('kc-1');
  });

  it('throws UserNotFoundError when no local record', async () => {
    repo.findByKeycloakId.mockResolvedValue(null);
    await expect(useCase.execute('kc-orphan')).rejects.toThrow(UserNotFoundError);
  });
});
