import * as jwt from 'jsonwebtoken';
import { SignOutUseCase } from '../../../src/modules/auth/application/use-cases/sign-out/sign-out.use-case';
import { SignOutCommand } from '../../../src/modules/auth/application/use-cases/sign-out/sign-out.command';
import { IdentityProviderPort } from '../../../src/modules/auth/domain/ports/identity-provider.port';
import { TokenStorePort } from '../../../src/modules/auth/domain/ports/token-store.port';

function tokenWithExp(secondsFromNow: number): string {
  const exp = Math.floor(Date.now() / 1000) + secondsFromNow;
  return jwt.sign({ exp }, 'dummy', { algorithm: 'HS256', noTimestamp: true });
}

describe('SignOutUseCase', () => {
  let idp: jest.Mocked<IdentityProviderPort>;
  let store: jest.Mocked<TokenStorePort>;
  let useCase: SignOutUseCase;

  beforeEach(() => {
    idp = {
      signIn: jest.fn(),
      refresh: jest.fn(),
      signOut: jest.fn().mockResolvedValue(undefined),
      verifyAccessToken: jest.fn(),
    };
    store = {
      blacklistToken: jest.fn().mockResolvedValue(undefined),
      isTokenBlacklisted: jest.fn(),
    };
    useCase = new SignOutUseCase(idp, store);
  });

  it('revokes refresh token via idp and blacklists access token with remaining TTL', async () => {
    const at = tokenWithExp(120);
    await useCase.execute(new SignOutCommand(at, 'rt'));
    expect(idp.signOut).toHaveBeenCalledWith('rt');
    expect(store.blacklistToken).toHaveBeenCalledTimes(1);
    const [token, ttl] = (store.blacklistToken as jest.Mock).mock.calls[0];
    expect(token).toBe(at);
    expect(ttl).toBeGreaterThan(100);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it('does not blacklist if access token is missing', async () => {
    await useCase.execute(new SignOutCommand(null, 'rt'));
    expect(idp.signOut).toHaveBeenCalled();
    expect(store.blacklistToken).not.toHaveBeenCalled();
  });

  it('does not blacklist already-expired access token (ttl<=0)', async () => {
    const expired = tokenWithExp(-100);
    await useCase.execute(new SignOutCommand(expired, 'rt'));
    expect(store.blacklistToken).not.toHaveBeenCalled();
  });
});
