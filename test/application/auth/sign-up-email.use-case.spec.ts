import { SignUpEmailCommand } from '../../../src/modules/auth/application/use-cases/sign-up-email/sign-up-email.command';
import { SignUpEmailUseCase } from '../../../src/modules/auth/application/use-cases/sign-up-email/sign-up-email.use-case';
import { PasswordPolicyViolationError } from '../../../src/modules/auth/domain/errors/password-policy-violation.error';
import { TermsNotAcceptedError } from '../../../src/modules/auth/domain/errors/terms-not-accepted.error';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { ContactAlreadyExistsError } from '../../../src/shared/domain/errors/contact-already-exists.error';
import {
  ProvisionedUser,
  UserProvisioning,
} from '../../../src/shared/application/user-provisioning.interface';

const PROVISIONED_USER: ProvisionedUser = {
  id: 'local-1',
  keycloakId: 'kc-1',
  email: 'new@example.com',
  phone: null,
  emailVerified: false,
  phoneVerified: false,
  firstName: null,
  lastName: null,
  roles: [],
  status: 'pending_verification',
  createdAt: '2026-10-09T10:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
};

describe('SignUpEmailUseCase', () => {
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let users: jest.Mocked<UserProvisioning>;
  let useCase: SignUpEmailUseCase;

  beforeEach(() => {
    identityAdmin = {
      createEmailUser: jest.fn().mockResolvedValue({ keycloakId: 'kc-1' }),
      findByEmail: jest.fn(),
      sendVerifyEmail: jest.fn().mockResolvedValue(undefined),
      findEmailVerificationEvents: jest.fn(),
    };
    users = { ensureFromIdentity: jest.fn().mockResolvedValue(PROVISIONED_USER) };
    useCase = new SignUpEmailUseCase(identityAdmin, users);
  });

  it('creates the identity account, provisions the shadow user and sends the magic link', async () => {
    const result = await useCase.execute(
      new SignUpEmailCommand('new@example.com', 'sup3r-secret', true),
    );

    expect(identityAdmin.createEmailUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'sup3r-secret',
      firstName: null,
      lastName: null,
    });
    expect(users.ensureFromIdentity).toHaveBeenCalledWith({
      keycloakId: 'kc-1',
      email: 'new@example.com',
      firstName: null,
      lastName: null,
    });
    expect(identityAdmin.sendVerifyEmail).toHaveBeenCalledWith('kc-1');
    expect(result).toEqual({ user: PROVISIONED_USER, verifyEmailSent: true });
  });

  it('passes optional profile fields through', async () => {
    await useCase.execute(new SignUpEmailCommand('new@example.com', 'pwd', true, 'Иван', 'Петров'));

    expect(identityAdmin.createEmailUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'pwd',
      firstName: 'Иван',
      lastName: 'Петров',
    });
  });

  it('rejects sign-up without accepted terms and creates nothing', async () => {
    await expect(
      useCase.execute(new SignUpEmailCommand('new@example.com', 'pwd', false)),
    ).rejects.toThrow(TermsNotAcceptedError);

    expect(identityAdmin.createEmailUser).not.toHaveBeenCalled();
    expect(users.ensureFromIdentity).not.toHaveBeenCalled();
  });

  it('propagates ContactAlreadyExists from the identity provider', async () => {
    identityAdmin.createEmailUser.mockRejectedValue(new ContactAlreadyExistsError());

    await expect(
      useCase.execute(new SignUpEmailCommand('taken@example.com', 'pwd', true)),
    ).rejects.toThrow(ContactAlreadyExistsError);
    expect(users.ensureFromIdentity).not.toHaveBeenCalled();
  });

  it('propagates PasswordPolicyViolation with the provider message in details', async () => {
    identityAdmin.createEmailUser.mockRejectedValue(
      new PasswordPolicyViolationError('invalidPasswordMinLengthMessage'),
    );

    const caught = await useCase
      .execute(new SignUpEmailCommand('new@example.com', '123', true))
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(PasswordPolicyViolationError);
    expect((caught as PasswordPolicyViolationError).details).toEqual({
      message: 'invalidPasswordMinLengthMessage',
    });
    expect(users.ensureFromIdentity).not.toHaveBeenCalled();
  });

  it('keeps sign-up successful when the verification email cannot be sent', async () => {
    identityAdmin.sendVerifyEmail.mockRejectedValue(new Error('SMTP is down'));

    const result = await useCase.execute(new SignUpEmailCommand('new@example.com', 'pwd', true));

    expect(result.user).toEqual(PROVISIONED_USER);
    expect(result.verifyEmailSent).toBe(false);
  });
});
