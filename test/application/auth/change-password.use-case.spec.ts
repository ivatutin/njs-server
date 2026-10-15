import { PasswordPolicyViolationError } from '../../../src/modules/auth/domain/errors/password-policy-violation.error';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { ChangePasswordCommand } from '../../../src/modules/auth/application/use-cases/change-password/change-password.command';
import { ChangePasswordUseCase } from '../../../src/modules/auth/application/use-cases/change-password/change-password.use-case';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

describe('ChangePasswordUseCase', () => {
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let useCase: ChangePasswordUseCase;

  beforeEach(() => {
    identityAdmin = {
      setPassword: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IdentityAdminPort>;
    useCase = new ChangePasswordUseCase(identityAdmin);
  });

  it('writes the new password for the authenticated user', async () => {
    await useCase.execute(new ChangePasswordCommand(KC_ID, 'NewPwd123456'));

    expect(identityAdmin.setPassword).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      password: 'NewPwd123456',
    });
  });

  it('lets the provider password policy through untouched (422)', async () => {
    identityAdmin.setPassword.mockRejectedValue(new PasswordPolicyViolationError('too short'));

    await expect(useCase.execute(new ChangePasswordCommand(KC_ID, 'short'))).rejects.toThrow(
      PasswordPolicyViolationError,
    );
  });
});
