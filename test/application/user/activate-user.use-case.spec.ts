import { ActivateUserUseCase } from '../../../src/modules/user/application/use-cases/activate-user/activate-user.use-case';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserNotFoundError } from '../../../src/modules/user/domain/errors/user-not-found.error';
import { RuleViolationError } from '../../../src/shared/domain/errors/rule-violation.error';

describe('ActivateUserUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: ActivateUserUseCase;
  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new ActivateUserUseCase(repo);
  });

  it('activates suspended user with verified contact', async () => {
    const u = User.create({ keycloakId: 'kc', email: 'a@b.com' });
    u.verifyEmail();
    u.suspend();
    repo.findById.mockResolvedValue(u);
    const result = await useCase.execute(u.id.toString());
    expect(result.status.getValue()).toBe('active');
  });

  it('throws RuleViolationError when no verified contact', async () => {
    const u = User.create({ keycloakId: 'kc', email: 'a@b.com' });
    repo.findById.mockResolvedValue(u);
    await expect(useCase.execute(u.id.toString())).rejects.toThrow(RuleViolationError);
  });

  it('throws UserNotFoundError when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
