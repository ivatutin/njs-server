import { VerifyUserPhoneUseCase } from '../../../src/modules/user/application/use-cases/verify-user-phone/verify-user-phone.use-case';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserNotFoundError } from '../../../src/modules/user/domain/errors/user-not-found.error';

describe('VerifyUserPhoneUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: VerifyUserPhoneUseCase;
  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new VerifyUserPhoneUseCase(repo);
  });

  it('verifies and activates', async () => {
    const u = User.create({ keycloakId: 'kc', phone: '+79991234567' });
    repo.findById.mockResolvedValue(u);
    const result = await useCase.execute(u.id.toString());
    expect(result.isPhoneVerified()).toBe(true);
    expect(result.status.isActive()).toBe(true);
  });

  it('throws when user not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
