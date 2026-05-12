import { DeleteUserUseCase } from '../../../src/modules/user/application/use-cases/delete-user/delete-user.use-case';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';

describe('DeleteUserUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: DeleteUserUseCase;
  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new DeleteUserUseCase(repo);
  });

  it('delegates to repo.delete', async () => {
    await useCase.execute('11111111-1111-1111-1111-111111111111');
    expect(repo.delete).toHaveBeenCalled();
  });

  it('propagates repo errors (e.g. mapped P2025 → UserNotFoundError)', async () => {
    const err = new Error('boom');
    repo.delete.mockRejectedValue(err);
    await expect(useCase.execute('11111111-1111-1111-1111-111111111111')).rejects.toThrow(err);
  });
});
