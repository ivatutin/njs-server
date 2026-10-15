import { ExecutionContext } from '@nestjs/common';
import { TokenClaims } from '../../src/shared/domain/token-claims';
import { ReauthTokenExpiredError } from '../../src/modules/auth/domain/errors/reauth-token-expired.error';
import { ReauthTokenInvalidError } from '../../src/modules/auth/domain/errors/reauth-token-invalid.error';
import { ReauthTokenStore } from '../../src/modules/auth/domain/ports/reauth-token-store.port';
import { ReauthTokenGuard } from '../../src/modules/auth/interfaces/http/guards/reauth-token.guard';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

function contextFor(
  headers: Record<string, string | undefined>,
  user?: TokenClaims,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, user }) }),
  } as unknown as ExecutionContext;
}

function claims(sub: string): TokenClaims {
  return { sub, email: null, roles: [], issuedAt: 1700000000 };
}

describe('ReauthTokenGuard', () => {
  let reauthTokens: jest.Mocked<ReauthTokenStore>;
  let guard: ReauthTokenGuard;

  beforeEach(() => {
    reauthTokens = {
      issue: jest.fn(),
      consume: jest.fn().mockResolvedValue({ keycloakId: KC_ID }),
    } as unknown as jest.Mocked<ReauthTokenStore>;
    guard = new ReauthTokenGuard(reauthTokens);
  });

  it('passes when the token belongs to the authenticated user', async () => {
    const ok = await guard.canActivate(
      contextFor({ 'x-reauth-token': 'tok' }, claims(KC_ID)),
    );

    expect(ok).toBe(true);
    expect(reauthTokens.consume).toHaveBeenCalledWith('tok');
  });

  it('rejects a missing header', async () => {
    await expect(guard.canActivate(contextFor({}, claims(KC_ID)))).rejects.toThrow(
      ReauthTokenInvalidError,
    );
    expect(reauthTokens.consume).not.toHaveBeenCalled();
  });

  it('rejects an expired or already used token', async () => {
    reauthTokens.consume.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor({ 'x-reauth-token': 'tok' }, claims(KC_ID))),
    ).rejects.toThrow(ReauthTokenExpiredError);
  });

  it('rejects a token issued for another user', async () => {
    reauthTokens.consume.mockResolvedValue({ keycloakId: 'someone-else' });

    await expect(
      guard.canActivate(contextFor({ 'x-reauth-token': 'tok' }, claims(KC_ID))),
    ).rejects.toThrow(ReauthTokenInvalidError);
  });

  it('rejects when there is no authenticated user at all', async () => {
    await expect(guard.canActivate(contextFor({ 'x-reauth-token': 'tok' }))).rejects.toThrow(
      ReauthTokenInvalidError,
    );
  });
});
