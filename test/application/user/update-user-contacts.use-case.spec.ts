import { UpdateUserContactsUseCase } from '../../../src/modules/user/application/use-cases/update-user-contacts/update-user-contacts.use-case';
import { UpdateUserContactsCommand } from '../../../src/modules/user/application/use-cases/update-user-contacts/update-user-contacts.command';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserNotFoundError } from '../../../src/modules/user/domain/errors/user-not-found.error';
import { PhoneAlreadyExistsError } from '../../../src/modules/user/domain/errors/phone-already-exists.error';

describe('UpdateUserContactsUseCase', () => {
  let repo: jest.Mocked<UserRepository>;
  let useCase: UpdateUserContactsUseCase;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByPhone: jest.fn().mockResolvedValue(null),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new UpdateUserContactsUseCase(repo);
  });

  it('throws when user missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute(
        new UpdateUserContactsCommand('11111111-1111-1111-1111-111111111111', 'x@y.com'),
      ),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('adds phone to email-only user', async () => {
    const u = User.create({ keycloakId: 'kc', email: 'a@b.com' });
    repo.findById.mockResolvedValue(u);
    const result = await useCase.execute(
      new UpdateUserContactsCommand(u.id.toString(), undefined, '+79991234567'),
    );
    expect(result.phone.getValue()).toBe('+79991234567');
  });

  it('throws PhoneAlreadyExistsError on conflict with another user', async () => {
    const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
    const other = User.create({ keycloakId: 'kc-2', phone: '+79991234567' });
    repo.findById.mockResolvedValue(u);
    repo.findByPhone.mockResolvedValue(other);
    await expect(
      useCase.execute(new UpdateUserContactsCommand(u.id.toString(), undefined, '+79991234567')),
    ).rejects.toThrow(PhoneAlreadyExistsError);
  });

  it('does NOT report conflict when same user already has the phone', async () => {
    const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com', phone: '+79991234567' });
    repo.findById.mockResolvedValue(u);
    repo.findByPhone.mockResolvedValue(u);
    await expect(
      useCase.execute(new UpdateUserContactsCommand(u.id.toString(), undefined, '+79991234567')),
    ).resolves.toBeDefined();
  });
});
