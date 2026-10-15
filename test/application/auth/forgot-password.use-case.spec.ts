import { ForgotPasswordCommand } from '../../../src/modules/auth/application/use-cases/forgot-password/forgot-password.command';
import { ForgotPasswordUseCase } from '../../../src/modules/auth/application/use-cases/forgot-password/forgot-password.use-case';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { PasswordResetRateLimiter } from '../../../src/modules/auth/domain/ports/password-reset-rate-limiter.port';

describe('ForgotPasswordUseCase', () => {
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let rateLimiter: jest.Mocked<PasswordResetRateLimiter>;
  let useCase: ForgotPasswordUseCase;

  const knownUser = {
    keycloakId: 'kc-1',
    email: 'user@example.com',
    emailVerified: true,
    firstName: null,
    lastName: null,
  };

  beforeEach(() => {
    identityAdmin = {
      createEmailUser: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(knownUser),
      sendVerifyEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      findEmailVerificationEvents: jest.fn(),
      createPhoneUser: jest.fn(),
      findByUsername: jest.fn(),
      findById: jest.fn(),
      setPassword: jest.fn(),
      logoutAllSessions: jest.fn(),
    };
    rateLimiter = { consume: jest.fn().mockResolvedValue({ allowed: true }) };
    useCase = new ForgotPasswordUseCase(identityAdmin, rateLimiter);
  });

  it('asks Keycloak for the UPDATE_PASSWORD link when the address exists', async () => {
    await useCase.execute(new ForgotPasswordCommand('user@example.com'));

    expect(rateLimiter.consume).toHaveBeenCalledWith('user@example.com');
    expect(identityAdmin.sendPasswordResetEmail).toHaveBeenCalledWith('kc-1');
  });

  it('stays silent for an unknown address (202 semantics)', async () => {
    identityAdmin.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute(new ForgotPasswordCommand('ghost@example.com')),
    ).resolves.toBeUndefined();
    expect(identityAdmin.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('skips the letter when rate limited without failing the request', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 1800 });

    await expect(
      useCase.execute(new ForgotPasswordCommand('user@example.com')),
    ).resolves.toBeUndefined();
    expect(identityAdmin.findByEmail).not.toHaveBeenCalled();
    expect(identityAdmin.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('swallows provider failures', async () => {
    identityAdmin.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP is down'));

    await expect(
      useCase.execute(new ForgotPasswordCommand('user@example.com')),
    ).resolves.toBeUndefined();
  });

  it('swallows rate-limiter failures (Redis unavailable)', async () => {
    rateLimiter.consume.mockRejectedValue(new Error('redis is down'));

    await expect(
      useCase.execute(new ForgotPasswordCommand('user@example.com')),
    ).resolves.toBeUndefined();
    expect(identityAdmin.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
