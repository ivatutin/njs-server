import { UpdateMyProfileUseCase } from '../../../src/modules/user/application/use-cases/update-my-profile/update-my-profile.use-case';
import { UpdateMyProfileCommand } from '../../../src/modules/user/application/use-cases/update-my-profile/update-my-profile.command';
import { UserRepository } from '../../../src/modules/user/domain/repositories/user.repository';
import { IdentityProfilePort } from '../../../src/modules/user/domain/ports/identity-profile.port';
import { IdentityProfileUnavailableError } from '../../../src/modules/user/domain/errors/identity-profile-unavailable.error';
import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { UserNotFoundError } from '../../../src/shared/domain/errors/user-not-found.error';

const KC_ID = 'kc-1';

function build() {
  const calls: string[] = [];

  const repo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    findByKeycloakId: jest.fn().mockImplementation(async () => {
      calls.push('shadow:read');
      return existingUser();
    }),
    save: jest.fn().mockImplementation(async () => {
      calls.push('shadow:write');
    }),
    delete: jest.fn(),
  } as unknown as jest.Mocked<UserRepository>;

  const identityProfile = {
    updateName: jest.fn().mockImplementation(async () => {
      calls.push('keycloak:write');
    }),
  } as unknown as jest.Mocked<IdentityProfilePort>;

  return {
    useCase: new UpdateMyProfileUseCase(repo, identityProfile),
    repo,
    identityProfile,
    calls,
  };
}

function existingUser(firstName: string | null = null, lastName: string | null = null): User {
  const user = User.create({ keycloakId: KC_ID, email: 'a@b.com', firstName, lastName });
  user.verifyEmail();
  return user;
}

describe('UpdateMyProfileUseCase (contract v1.6)', () => {
  it('пишет сначала в Keycloak, затем в shadow', async () => {
    const { useCase, repo, identityProfile, calls } = build();

    const updated = await useCase.execute(new UpdateMyProfileCommand(KC_ID, 'Jane', 'Doe'));

    expect(identityProfile.updateName).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect(calls).toEqual(['shadow:read', 'keycloak:write', 'shadow:write']);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(updated.firstName).toBe('Jane');
    expect(updated.lastName).toBe('Doe');
  });

  it('частичное тело: второе поле не передаётся в Keycloak (undefined = не трогаем)', async () => {
    const { useCase, identityProfile } = build();

    const updated = await useCase.execute(new UpdateMyProfileCommand(KC_ID, 'Jane'));

    expect(identityProfile.updateName).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      firstName: 'Jane',
      lastName: undefined,
    });
    expect(updated.firstName).toBe('Jane');
    expect(updated.lastName).toBeNull();
  });

  it('Keycloak недоступен → 503, shadow не тронут', async () => {
    const { useCase, repo, identityProfile } = build();
    identityProfile.updateName.mockRejectedValue(new IdentityProfileUnavailableError());

    await expect(
      useCase.execute(new UpdateMyProfileCommand(KC_ID, 'Jane')),
    ).rejects.toBeInstanceOf(IdentityProfileUnavailableError);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('нет shadow-записи → UserNotFound (404), в Keycloak не ходим', async () => {
    const { useCase, repo, identityProfile } = build();
    repo.findByKeycloakId.mockResolvedValue(null);

    await expect(
      useCase.execute(new UpdateMyProfileCommand(KC_ID, 'Jane')),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(identityProfile.updateName).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('503-ошибка — это ServiceUnavailableException (контракт v1.6: error = Service Unavailable)', () => {
    const err = new IdentityProfileUnavailableError();
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toMatchObject({ statusCode: 503, error: 'Service Unavailable' });
  });
});
