import { InvalidCredentialsError } from '../../../src/modules/auth/domain/errors/invalid-credentials.error';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { IdentityProviderPort } from '../../../src/modules/auth/domain/ports/identity-provider.port';
import { ReauthTokenStore } from '../../../src/modules/auth/domain/ports/reauth-token-store.port';
import { RequestReauthCommand } from '../../../src/modules/auth/application/use-cases/request-reauth/request-reauth.command';
import { RequestReauthUseCase } from '../../../src/modules/auth/application/use-cases/request-reauth/request-reauth.use-case';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';
const EXPIRES_AT = new Date('2026-10-14T12:10:00.000Z');

describe('RequestReauthUseCase', () => {
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let idp: jest.Mocked<IdentityProviderPort>;
  let reauthTokens: jest.Mocked<ReauthTokenStore>;
  let useCase: RequestReauthUseCase;

  beforeEach(() => {
    identityAdmin = {
      findById: jest.fn().mockResolvedValue({
        keycloakId: KC_ID,
        username: '+79990000110',
        email: null,
        emailVerified: false,
        firstName: 'Иван',
        lastName: 'Петров',
      }),
    } as unknown as jest.Mocked<IdentityAdminPort>;
    idp = {
      signIn: jest.fn().mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 300,
      }),
      signOut: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IdentityProviderPort>;
    reauthTokens = {
      issue: jest.fn().mockResolvedValue({ token: 'reauth-token-1', expiresAt: EXPIRES_AT }),
      consume: jest.fn(),
    } as unknown as jest.Mocked<ReauthTokenStore>;
    useCase = new RequestReauthUseCase(identityAdmin, idp, reauthTokens);
  });

  it('issues a one-shot reauth token after the password is confirmed', async () => {
    const result = await useCase.execute(new RequestReauthCommand(KC_ID, 'passw0rd'));

    expect(result).toEqual({ reauthToken: 'reauth-token-1', expiresAt: EXPIRES_AT.toISOString() });
    expect(reauthTokens.issue).toHaveBeenCalledWith({ keycloakId: KC_ID });
  });

  it('uses the Keycloak username, so passwordless phone users work too', async () => {
    await useCase.execute(new RequestReauthCommand(KC_ID, 'passw0rd'));

    expect(idp.signIn).toHaveBeenCalledWith('+79990000110', 'passw0rd');
  });

  it('revokes the session created by the password check (reauth is not a sign-in)', async () => {
    await useCase.execute(new RequestReauthCommand(KC_ID, 'passw0rd'));

    expect(idp.signOut).toHaveBeenCalledWith('rt');
  });

  it('answers 401 and issues nothing when the password is wrong', async () => {
    idp.signIn.mockRejectedValue(new Error('invalid_grant'));

    await expect(useCase.execute(new RequestReauthCommand(KC_ID, 'nope'))).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(reauthTokens.issue).not.toHaveBeenCalled();
  });

  it('answers 401 when the user has no identity in Keycloak', async () => {
    identityAdmin.findById.mockResolvedValue(null);

    await expect(useCase.execute(new RequestReauthCommand(KC_ID, 'passw0rd'))).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(idp.signIn).not.toHaveBeenCalled();
  });
});
