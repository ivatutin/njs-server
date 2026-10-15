import { ResendVerifyEmailCommand } from '../../../src/modules/auth/application/use-cases/resend-verify-email/resend-verify-email.command';
import { ResendVerifyEmailUseCase } from '../../../src/modules/auth/application/use-cases/resend-verify-email/resend-verify-email.use-case';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';

describe('ResendVerifyEmailUseCase', () => {
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let useCase: ResendVerifyEmailUseCase;

  const unverified = {
    keycloakId: 'kc-1',
    email: 'new@example.com',
    emailVerified: false,
    firstName: null,
    lastName: null,
  };

  beforeEach(() => {
    identityAdmin = {
      createEmailUser: jest.fn(),
      findByEmail: jest.fn(),
      sendVerifyEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn(),
      findEmailVerificationEvents: jest.fn(),
      createPhoneUser: jest.fn(),
      findByUsername: jest.fn(),
      findById: jest.fn(),
      setPassword: jest.fn(),
      logoutAllSessions: jest.fn(),
      updateContacts: jest.fn(),
    };
    useCase = new ResendVerifyEmailUseCase(identityAdmin);
  });

  it('sends a fresh link for an unverified address', async () => {
    identityAdmin.findByEmail.mockResolvedValue(unverified);

    await useCase.execute(new ResendVerifyEmailCommand('new@example.com'));

    expect(identityAdmin.sendVerifyEmail).toHaveBeenCalledWith('kc-1');
  });

  it('stays silent for an unknown address (anti-enumeration)', async () => {
    identityAdmin.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute(new ResendVerifyEmailCommand('ghost@example.com')),
    ).resolves.toBeUndefined();
    expect(identityAdmin.sendVerifyEmail).not.toHaveBeenCalled();
  });

  it('does not resend for an already verified address', async () => {
    identityAdmin.findByEmail.mockResolvedValue({ ...unverified, emailVerified: true });

    await useCase.execute(new ResendVerifyEmailCommand('new@example.com'));

    expect(identityAdmin.sendVerifyEmail).not.toHaveBeenCalled();
  });

  it('swallows provider failures instead of failing the request', async () => {
    identityAdmin.findByEmail.mockRejectedValue(new Error('keycloak unavailable'));

    await expect(
      useCase.execute(new ResendVerifyEmailCommand('new@example.com')),
    ).resolves.toBeUndefined();
  });
});
