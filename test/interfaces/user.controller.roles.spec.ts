import { ROLES_KEY } from '../../src/shared/interfaces/http/decorators/roles.decorator';
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

  it('на классе UserController ролей нет (класс-левел сломал бы /users/me)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UserController)).toBeUndefined();
  });

  it('AccountSecurityController (set-password/password) без ролей', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AccountSecurityController)).toBeUndefined();
  });
});
