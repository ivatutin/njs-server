import { PasswordPolicyViolationError } from '../../../src/modules/auth/domain/errors/password-policy-violation.error';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { SetPasswordCommand } from '../../../src/modules/auth/application/use-cases/set-password/set-password.command';
import { SetPasswordUseCase } from '../../../src/modules/auth/application/use-cases/set-password/set-password.use-case';
import { RevokeUserAccessUseCase } from '../../../src/modules/auth/application/use-cases/revoke-user-access/revoke-user-access.use-case';
import { VerificationTokenConsumer } from '../../../src/shared/application/verification-token-consumer.interface';
import { VerificationTokenExpiredError } from '../../../src/shared/domain/errors/verification-token-expired.error';
import { VerificationTokenInvalidError } from '../../../src/shared/domain/errors/verification-token-invalid.error';

const KC_ID = 'a350af07-f892-4b5a-8502-a72d2bb8aa5d';
const PHONE = '+79990000110';

describe('SetPasswordUseCase', () => {
  let verification: jest.Mocked<VerificationTokenConsumer>;
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let revoke: jest.Mocked<RevokeUserAccessUseCase>;
  let useCase: SetPasswordUseCase;

  beforeEach(() => {
    verification = {
      consume: jest.fn().mockResolvedValue({ target: PHONE, purpose: 'set-password' }),
    } as unknown as jest.Mocked<VerificationTokenConsumer>;
    identityAdmin = {
      findById: jest.fn().mockResolvedValue({
        keycloakId: KC_ID,
        username: PHONE,
        phone: PHONE,
        email: null,
        emailVerified: false,
        firstName: 'Иван',
        lastName: 'Петров',
      }),
      setPassword: jest.fn().mockResolvedValue(undefined),
      logoutAllSessions: jest.fn(),
    } as unknown as jest.Mocked<IdentityAdminPort>;
    revoke = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<RevokeUserAccessUseCase>;
    useCase = new SetPasswordUseCase(verification, identityAdmin, revoke);
  });

  it('sets the password when the token belongs to the caller’s own phone', async () => {
    await useCase.execute(new SetPasswordCommand(KC_ID, 'vt', 'NewPwd12345'));

    expect(identityAdmin.setPassword).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      password: 'NewPwd12345',
    });
  });

  it('accepts a token issued for the caller’s email too', async () => {
    verification.consume.mockResolvedValue({ target: 'user@example.com', purpose: 'set-password' });
    identityAdmin.findById.mockResolvedValue({
      keycloakId: KC_ID,
      username: 'user@example.com',
      phone: null,
      email: 'user@example.com',
      emailVerified: true,
      firstName: 'Иван',
      lastName: 'Петров',
    });

    await useCase.execute(new SetPasswordCommand(KC_ID, 'vt', 'NewPwd12345'));

    expect(identityAdmin.setPassword).toHaveBeenCalled();
  });

  it('rejects an unknown or already used token', async () => {
    verification.consume.mockResolvedValue(null);

    await expect(useCase.execute(new SetPasswordCommand(KC_ID, 'vt', 'NewPwd12345'))).rejects.toThrow(
      VerificationTokenExpiredError,
    );
    expect(identityAdmin.setPassword).not.toHaveBeenCalled();
  });

  it('rejects a token issued for another purpose', async () => {
    verification.consume.mockResolvedValue({ target: PHONE, purpose: 'sign-in' });

    await expect(useCase.execute(new SetPasswordCommand(KC_ID, 'vt', 'NewPwd12345'))).rejects.toThrow(
      VerificationTokenInvalidError,
    );
    expect(identityAdmin.setPassword).not.toHaveBeenCalled();
  });

  it('rejects a token for a contact that is not the caller’s (account takeover guard)', async () => {
    // Токен валиден, но выдан на чужой номер — пароль менять нельзя.
    verification.consume.mockResolvedValue({ target: '+79990000999', purpose: 'set-password' });

    await expect(useCase.execute(new SetPasswordCommand(KC_ID, 'vt', 'NewPwd12345'))).rejects.toThrow(
      VerificationTokenInvalidError,
    );
    expect(identityAdmin.setPassword).not.toHaveBeenCalled();
  });

  it('rejects a token when the identity is gone', async () => {
    identityAdmin.findById.mockResolvedValue(null);

    await expect(useCase.execute(new SetPasswordCommand(KC_ID, 'vt', 'NewPwd12345'))).rejects.toThrow(
      VerificationTokenInvalidError,
    );
  });

  it('lets the provider password policy through untouched (422)', async () => {
    identityAdmin.setPassword.mockRejectedValue(new PasswordPolicyViolationError('too short'));

    await expect(useCase.execute(new SetPasswordCommand(KC_ID, 'vt', 'short'))).rejects.toThrow(
      PasswordPolicyViolationError,
    );
  });
});
