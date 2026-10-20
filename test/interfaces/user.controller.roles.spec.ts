import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../src/shared/interfaces/http/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../src/shared/interfaces/http/decorators/public.decorator';
import { UserController } from '../../src/modules/user/interfaces/http/user.controller';
import { AccountSecurityController } from '../../src/modules/auth/interfaces/http/account-security.controller';

const ADMIN_METHODS = [
  'create',
  'findOne',
  'updateProfile',
  'updateContacts',
  'verifyEmail',
  'verifyPhone',
  'suspend',
  'activate',
  'remove',
] as const;

function rolesOf(method: string): string[] | undefined {
  const handler = (UserController.prototype as unknown as Record<string, unknown>)[method];
  return Reflect.getMetadata(ROLES_KEY, handler as object) as string[] | undefined;
}

describe('RBAC-раскладка контроллеров (ADR-0020)', () => {
  it('все админские методы UserController требуют роль admin', () => {
    for (const method of ADMIN_METHODS) {
      expect(rolesOf(method)).toEqual(['admin']);
    }
  });

  it('GET /users/me доступен без ролей', () => {
    expect(rolesOf('me')).toBeUndefined();
  });

  it('PATCH /users/me/profile — self-service: без ролей (контракт v1.6)', () => {
    expect(rolesOf('updateMyProfile')).toBeUndefined();
  });

  it('маршрут me/profile объявлен выше :id/profile (иначе `me` уйдёт в ParseUUIDPipe)', () => {
    const methods = Object.getOwnPropertyNames(UserController.prototype);
    const meIndex = methods.indexOf('updateMyProfile');
    const byIdIndex = methods.indexOf('updateProfile');

    expect(meIndex).toBeGreaterThan(-1);
    expect(byIdIndex).toBeGreaterThan(-1);
    expect(meIndex).toBeLessThan(byIdIndex);
    expect(Reflect.getMetadata(PATH_METADATA, UserController.prototype.updateMyProfile)).toBe(
      'me/profile',
    );
  });

  it('PATCH /users/me/profile не помечен @Public (401 без токена даёт глобальный JwtAuthGuard)', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, UserController.prototype.updateMyProfile),
    ).toBeUndefined();
  });

  it('на классе UserController ролей нет (класс-левел сломал бы /users/me)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UserController)).toBeUndefined();
  });

  it('AccountSecurityController (set-password/password) без ролей', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AccountSecurityController)).toBeUndefined();
  });
});
