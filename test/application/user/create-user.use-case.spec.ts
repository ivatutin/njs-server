import { CreateUserUseCase } from '../../../src/modules/user/application/use-cases/create-user/create-user.use-case';
import { CreateUserCommand } from '../../../src/modules/user/application/use-cases/create-user/create-user.command';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { EmailAlreadyExistsError } from '../../../src/modules/user/domain/errors/email-already-exists.error';
import { PhoneAlreadyExistsError } from '../../../src/modules/user/domain/errors/phone-already-exists.error';

describe('CreateUserUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByPhone: jest.fn().mockResolvedValue(null),
      findByKeycloakId: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
    };
    useCase = new CreateUserUseCase(repo);
  });

  it('creates user when email is unique', async () => {
    const user = await useCase.execute(new CreateUserCommand('kc-1', 'a@b.com'));
    expect(user.email?.toString()).toBe('a@b.com');
    expect(repo.findByEmail).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(user);
  });

  it('throws EmailAlreadyExistsError on duplicate email (pre-check)', async () => {
    repo.findByEmail.mockResolvedValueOnce(
      User.create({ keycloakId: 'other', email: 'a@b.com' }),
    );
    await expect(useCase.execute(new CreateUserCommand('kc-1', 'a@b.com'))).rejects.toThrow(
      EmailAlreadyExistsError,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('throws PhoneAlreadyExistsError on duplicate phone', async () => {
    repo.findByPhone.mockResolvedValueOnce(
      User.create({ keycloakId: 'other', phone: '+79991234567' }),
    );
    await expect(
      useCase.execute(new CreateUserCommand('kc-1', null, '+79991234567')),
    ).rejects.toThrow(PhoneAlreadyExistsError);
  });

  it('passes through optional fields', async () => {
    const user = await useCase.execute(
      new CreateUserCommand('kc-1', 'a@b.com', null, 'John', 'Doe', ['admin']),
    );
    expect(user.firstName).toBe('John');
    expect(user.lastName).toBe('Doe');
    expect(user.roles).toEqual(['admin']);
  });
});
