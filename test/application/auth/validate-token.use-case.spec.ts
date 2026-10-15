import { ValidateTokenUseCase } from '../../../src/modules/auth/application/use-cases/validate-token/validate-token.use-case';
import { IdentityProviderPort } from '../../../src/modules/auth/domain/ports/identity-provider.port';
import { TokenStorePort } from '../../../src/modules/auth/domain/ports/token-store.port';
import { InvalidTokenError } from '../../../src/modules/auth/domain/errors/invalid-token.error';

describe('ValidateTokenUseCase', () => {
  let idp: jest.Mocked<IdentityProviderPort>;
  let store: jest.Mocked<TokenStorePort>;
  let useCase: ValidateTokenUseCase;

  beforeEach(() => {
    idp = {
      signIn: jest.fn(),
      refresh: jest.fn(),
      signOut: jest.fn(),
      verifyAccessToken: jest.fn().mockResolvedValue({
        sub: 'kc',
        email: 'a@b.com',
        roles: [],
        issuedAt: 1700000000,
      }),
    };
    store = {
      blacklistToken: jest.fn(),
      revokeUserTokens: jest.fn(),
      isAccessRevoked: jest.fn().mockResolvedValue(false),
    };
    useCase = new ValidateTokenUseCase(idp, store);
  });

  it('returns claims on valid non-blacklisted token', async () => {
    const claims = await useCase.execute('at');
    expect(claims.email).toBe('a@b.com');
    expect(idp.verifyAccessToken).toHaveBeenCalledWith('at');
  });

  it('throws InvalidTokenError when the token is revoked (ADR-0018)', async () => {
    store.isAccessRevoked.mockResolvedValue(true);
    await expect(useCase.execute('revoked')).rejects.toThrow(InvalidTokenError);
    // Отзыв проверяется после верификации: метка сверяется с `sub` и `iat` из claims.
    expect(store.isAccessRevoked).toHaveBeenCalledWith({
      token: 'revoked',
      sub: 'kc',
      issuedAt: 1700000000,
    });
  });

  it('propagates verify errors', async () => {
    idp.verifyAccessToken.mockRejectedValue(new InvalidTokenError());
    await expect(useCase.execute('bad')).rejects.toThrow(InvalidTokenError);
  });
});
