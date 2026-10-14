import { ServiceUnavailableException } from '@nestjs/common';
import {
  UserProvisioning,
  USER_PROVISIONING,
} from '../../../src/shared/application/user-provisioning.interface';
import { VerificationTokenConsumer } from '../../../src/shared/application/verification-token-consumer.interface';
import { VerificationTokenExpiredError } from '../../../src/shared/domain/errors/verification-token-expired.error';
import { VerificationTokenInvalidError } from '../../../src/shared/domain/errors/verification-token-invalid.error';
import { SignUpPhoneCommand } from '../../../src/modules/auth/application/use-cases/sign-up-phone/sign-up-phone.command';
import { SignUpPhoneUseCase } from '../../../src/modules/auth/application/use-cases/sign-up-phone/sign-up-phone.use-case';
import { UserTokenMintService } from '../../../src/modules/auth/application/services/user-token-mint.service';
import { TermsNotAcceptedError } from '../../../src/modules/auth/domain/errors/terms-not-accepted.error';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { PendingMintStore } from '../../../src/modules/auth/domain/ports/pending-mint-store.port';
import { UserTokenIssuer } from '../../../src/modules/auth/domain/ports/user-token-issuer.port';

const PHONE = '+79991234567';

function provisionedUser() {
  return {
    id: 'local-1',
    keycloakId: 'kc-1',
    email: null,
    phone: PHONE,
    emailVerified: false,
    phoneVerified: true,
    firstName: 'Пользователь',
    lastName: '—',
    roles: [],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('SignUpPhoneUseCase', () => {
  let verification: jest.Mocked<VerificationTokenConsumer>;
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let users: jest.Mocked<UserProvisioning>;
  let issuer: jest.Mocked<UserTokenIssuer>;
  let pendingMints: jest.Mocked<PendingMintStore>;
  let useCase: SignUpPhoneUseCase;

  beforeEach(() => {
    verification = {
      consume: jest.fn().mockResolvedValue({ target: PHONE, purpose: 'sign-up' }),
    } as unknown as jest.Mocked<VerificationTokenConsumer>;
    identityAdmin = {
      createPhoneUser: jest.fn().mockResolvedValue({ keycloakId: 'kc-1' }),
    } as unknown as jest.Mocked<IdentityAdminPort>;
    users = {
      ensureFromIdentity: jest.fn().mockResolvedValue(provisionedUser()),
    } as unknown as jest.Mocked<UserProvisioning>;
    issuer = {
      startBackchannelAuth: jest.fn().mockResolvedValue({ authReqId: 'req-1', intervalSeconds: 5 }),
      exchangeBackchannelAuth: jest
        .fn()
        .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 300 }),
      verifyChannelToken: jest.fn(),
      completeBackchannelAuth: jest.fn(),
    } as unknown as jest.Mocked<UserTokenIssuer>;
    pendingMints = {
      save: jest.fn(),
      consume: jest.fn(),
    } as unknown as jest.Mocked<PendingMintStore>;
    useCase = new SignUpPhoneUseCase(
      verification,
      identityAdmin,
      users,
      new UserTokenMintService(issuer, pendingMints),
    );
  });

  it('rejects when terms are not accepted', async () => {
    await expect(
      useCase.execute(new SignUpPhoneCommand(PHONE, 'token', false)),
    ).rejects.toThrow(TermsNotAcceptedError);
    expect(verification.consume).not.toHaveBeenCalled();
  });

  it('rejects an unknown or already used verificationToken', async () => {
    verification.consume.mockResolvedValue(null);

    await expect(useCase.execute(new SignUpPhoneCommand(PHONE, 'token', true))).rejects.toThrow(
      VerificationTokenExpiredError,
    );
    expect(identityAdmin.createPhoneUser).not.toHaveBeenCalled();
  });

  it('rejects a token issued for another purpose', async () => {
    verification.consume.mockResolvedValue({ target: PHONE, purpose: 'sign-in' });

    await expect(useCase.execute(new SignUpPhoneCommand(PHONE, 'token', true))).rejects.toThrow(
      VerificationTokenInvalidError,
    );
  });

  it('rejects a token issued for another phone', async () => {
    verification.consume.mockResolvedValue({ target: '+79990000000', purpose: 'sign-up' });

    await expect(useCase.execute(new SignUpPhoneCommand(PHONE, 'token', true))).rejects.toThrow(
      VerificationTokenInvalidError,
    );
  });

  it('fills neutral names (KC 26 needs a complete profile) and marks the phone verified', async () => {
    await useCase.execute(new SignUpPhoneCommand(PHONE, 'token', true));

    expect(identityAdmin.createPhoneUser).toHaveBeenCalledWith({
      phone: PHONE,
      firstName: 'Пользователь',
      lastName: '—',
    });
    expect(users.ensureFromIdentity).toHaveBeenCalledWith({
      keycloakId: 'kc-1',
      phone: PHONE,
      phoneVerified: true,
      firstName: 'Пользователь',
      lastName: '—',
    });
  });

  it('keeps the names sent by the frontend', async () => {
    await useCase.execute(new SignUpPhoneCommand(PHONE, 'token', true, 'Иван', 'Петров'));

    expect(identityAdmin.createPhoneUser).toHaveBeenCalledWith({
      phone: PHONE,
      firstName: 'Иван',
      lastName: 'Петров',
    });
  });

  it('registers the pending mint before asking Keycloak and returns user with tokens', async () => {
    const result = await useCase.execute(new SignUpPhoneCommand(PHONE, 'token', true));

    const saveOrder = pendingMints.save.mock.invocationCallOrder[0];
    const startOrder = issuer.startBackchannelAuth.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(startOrder);

    expect(pendingMints.save).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ loginHint: PHONE, keycloakId: 'kc-1', purpose: 'sign-up' }),
    );
    expect(issuer.startBackchannelAuth).toHaveBeenCalledWith({
      loginHint: PHONE,
      bindingMessage: expect.any(String),
    });
    expect(result.user.phoneVerified).toBe(true);
    expect(result.tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 300 });
  });

  it('answers 503 without a new contract code when Keycloak cannot issue tokens', async () => {
    issuer.exchangeBackchannelAuth.mockRejectedValue(new Error('HTTP 400'));

    await expect(useCase.execute(new SignUpPhoneCommand(PHONE, 'token', true))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
