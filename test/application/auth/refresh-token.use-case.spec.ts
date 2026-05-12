import { RefreshTokenUseCase } from '../../../src/modules/auth/application/use-cases/refresh-token/refresh-token.use-case';
import { IdentityProviderPort } from '../../../src/modules/auth/domain/ports/identity-provider.port';

describe('RefreshTokenUseCase', () => {
  let idp: jest.Mocked<IdentityProviderPort>;
  let useCase: RefreshTokenUseCase;

  beforeEach(() => {
    idp = {
      signIn: jest.fn(),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new.at',
        refreshToken: 'new.rt',
        expiresIn: 300,
      }),
      signOut: jest.fn(),
      verifyAccessToken: jest.fn(),
    };
    useCase = new RefreshTokenUseCase(idp);
  });

  it('forwards to idp.refresh', async () => {
    const result = await useCase.execute('old.rt');
    expect(idp.refresh).toHaveBeenCalledWith('old.rt');
    expect(result.accessToken).toBe('new.at');
  });
});
