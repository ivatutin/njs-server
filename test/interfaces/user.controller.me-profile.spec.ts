import { ServiceUnavailableException } from '@nestjs/common';
import { UserController } from '../../src/modules/user/interfaces/http/user.controller';
import { UpdateMyProfileCommand } from '../../src/modules/user/application/use-cases/update-my-profile/update-my-profile.command';
import { IdentityProfileUnavailableError } from '../../src/modules/user/domain/errors/identity-profile-unavailable.error';
import { UpdateUserProfileSchema } from '../../src/modules/user/interfaces/http/dto/update-user-profile.dto';
import { User } from '../../src/modules/user/domain/entities/user.entity';
import { TokenClaims } from '../../src/shared/domain/token-claims';

const CLAIMS: TokenClaims = {
  sub: 'kc-1',
  email: 'a@b.com',
  roles: ['user'],
  issuedAt: 0,
};

function profileUser(firstName: string | null = null, lastName: string | null = null): User {
  const user = User.create({ keycloakId: 'kc-1', email: 'a@b.com', firstName, lastName });
  user.verifyEmail();
  return user;
}

function build() {
  const updateMyProfile = { execute: jest.fn() };
  const controller = new UserController(
    {} as never, // createUser
    {} as never, // getUserById
    {} as never, // getUserByKeycloakId
    {} as never, // updateUserProfile (admin)
    updateMyProfile as never, // updateMyProfile (self-service)
    {} as never, // updateUserContacts
    {} as never, // verifyUserEmail
    {} as never, // verifyUserPhone
    {} as never, // suspendUser
    {} as never, // activateUser
    {} as never, // deleteUser
  );
  return { controller, updateMyProfile };
}

describe('PATCH /users/me/profile (contract v1.6)', () => {
  it('200 с частичным телом: Keycloak id берётся из токена, а не из URL', async () => {
    const { controller, updateMyProfile } = build();
    updateMyProfile.execute.mockResolvedValue(profileUser('Jane', null));

    const response = await controller.updateMyProfile(CLAIMS, { firstName: 'Jane' });

    expect(updateMyProfile.execute).toHaveBeenCalledTimes(1);
    const command = (updateMyProfile.execute as jest.Mock).mock.calls[0][0] as UpdateMyProfileCommand;
    expect(command).toBeInstanceOf(UpdateMyProfileCommand);
    expect(command.keycloakId).toBe('kc-1');
    expect(command.firstName).toBe('Jane');
    expect(command.lastName).toBeUndefined();

    expect(response.firstName).toBe('Jane');
    expect(response.lastName).toBeNull();
    expect(response.id).toBeDefined();
  });

  it('503 при недоступном Keycloak (ошибка порта поднимается как ServiceUnavailableException)', async () => {
    const { controller, updateMyProfile } = build();
    updateMyProfile.execute.mockRejectedValue(new IdentityProfileUnavailableError());

    await expect(controller.updateMyProfile(CLAIMS, { lastName: 'Doe' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  describe('валидация тела: 1-100, хотя бы одно поле', () => {
    it('принимает одно поле', () => {
      expect(UpdateUserProfileSchema.safeParse({ firstName: 'Jane' }).success).toBe(true);
      expect(UpdateUserProfileSchema.safeParse({ lastName: 'Doe' }).success).toBe(true);
    });

    it('принимает null (очистка имени)', () => {
      expect(UpdateUserProfileSchema.safeParse({ firstName: null }).success).toBe(true);
    });

    it('пустое тело — 400', () => {
      expect(UpdateUserProfileSchema.safeParse({}).success).toBe(false);
    });

    it('пустая строка — 400', () => {
      expect(UpdateUserProfileSchema.safeParse({ firstName: '' }).success).toBe(false);
    });

    it('101 символ — 400, 100 — ок', () => {
      expect(UpdateUserProfileSchema.safeParse({ firstName: 'x'.repeat(101) }).success).toBe(false);
      expect(UpdateUserProfileSchema.safeParse({ firstName: 'x'.repeat(100) }).success).toBe(true);
    });
  });
});
