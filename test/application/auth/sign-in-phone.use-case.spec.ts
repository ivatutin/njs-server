import { SignInPhoneCommand } from '../../../src/modules/auth/application/use-cases/sign-in-phone/sign-in-phone.command';
import { SignInPhoneUseCase } from '../../../src/modules/auth/application/use-cases/sign-in-phone/sign-in-phone.use-case';
import { UserTokenMintService } from '../../../src/modules/auth/application/services/user-token-mint.service';
import { InvalidCredentialsError } from '../../../src/modules/auth/domain/errors/invalid-credentials.error';
import { PendingMintStore } from '../../../src/modules/auth/domain/ports/pending-mint-store.port';
import { UserTokenIssuer } from '../../../src/modules/auth/domain/ports/user-token-issuer.port';
import { ContactLookup } from '../../../src/shared/application/contact-lookup.interface';
import { LoginHandleResolver } from '../../../src/shared/application/login-handle.interface';
import { VerificationTokenConsumer } from '../../../src/shared/application/verification-token-consumer.interface';
import { VerificationTokenExpiredError } from '../../../src/shared/domain/errors/verification-token-expired.error';
import { VerificationTokenInvalidError } from '../../../src/shared/domain/errors/verification-token-invalid.error';

const PHONE = '+79991234567';

describe('SignInPhoneUseCase', () => {
  let verification: jest.Mocked<VerificationTokenConsumer>;
  let contacts: jest.Mocked<ContactLookup>;
  let issuer: jest.Mocked<UserTokenIssuer>;
  let pendingMints: jest.Mocked<PendingMintStore>;
  let useCase: SignInPhoneUseCase;

  beforeEach(() => {
    verification = {
      consume: jest.fn().mockResolvedValue({ target: PHONE, purpose: 'sign-in' }),
    };
    contacts = {
      existsByPhone: jest.fn(),
      findKeycloakIdByPhone: jest.fn().mockResolvedValue('kc-1'),
    } as unknown as jest.Mocked<ContactLookup>;
    issuer = {
      startBackchannelAuth: jest.fn().mockResolvedValue({ authReqId: 'req-1', intervalSeconds: 5 }),
      exchangeBackchannelAuth: jest
        .fn()
        .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 300 }),
      verifyChannelToken: jest.fn(),
      completeBackchannelAuth: jest.fn(),
    } as unknown as jest.Mocked<UserTokenIssuer>;
    pendingMints = { save: jest.fn(), consume: jest.fn() } as unknown as jest.Mocked<PendingMintStore>;
    const handles = {
      byPhone: jest.fn(),
      byEmail: jest.fn(),
      byKeycloakId: jest.fn().mockResolvedValue('usr_test_handle'),
    } as unknown as jest.Mocked<LoginHandleResolver>;
    useCase = new SignInPhoneUseCase(
      verification,
      contacts,
      handles,
      new UserTokenMintService(issuer, pendingMints),
    );
  });

  it('rejects an unknown verificationToken', async () => {
    verification.consume.mockResolvedValue(null);

    await expect(useCase.execute(new SignInPhoneCommand(PHONE, 'token'))).rejects.toThrow(
      VerificationTokenExpiredError,
    );
  });

  it('rejects a sign-up token used for sign-in', async () => {
    verification.consume.mockResolvedValue({ target: PHONE, purpose: 'sign-up' });

    await expect(useCase.execute(new SignInPhoneCommand(PHONE, 'token'))).rejects.toThrow(
      VerificationTokenInvalidError,
    );
  });

  it('answers 401 and never touches Keycloak when the number is unknown (anti-enumeration)', async () => {
    contacts.findKeycloakIdByPhone.mockResolvedValue(null);

    await expect(useCase.execute(new SignInPhoneCommand(PHONE, 'token'))).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(issuer.startBackchannelAuth).not.toHaveBeenCalled();
    expect(pendingMints.save).not.toHaveBeenCalled();
  });

  it('issues tokens for a registered number', async () => {
    const tokens = await useCase.execute(new SignInPhoneCommand(PHONE, 'token'));

    expect(contacts.findKeycloakIdByPhone).toHaveBeenCalledWith(PHONE);
    expect(pendingMints.save).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ loginHint: 'usr_test_handle', keycloakId: 'kc-1', purpose: 'sign-in' }),
    );
    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 300 });
  });
});
