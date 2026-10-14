import { HandleCibaChannelRequestCommand } from '../../../src/modules/auth/application/use-cases/handle-ciba-channel-request/handle-ciba-channel-request.command';
import { HandleCibaChannelRequestUseCase } from '../../../src/modules/auth/application/use-cases/handle-ciba-channel-request/handle-ciba-channel-request.use-case';
import { InvalidTokenError } from '../../../src/modules/auth/domain/errors/invalid-token.error';
import { PendingMintStore } from '../../../src/modules/auth/domain/ports/pending-mint-store.port';
import { UserTokenIssuer } from '../../../src/modules/auth/domain/ports/user-token-issuer.port';

const BINDING = 'b-1';

/** Callback уходит по таймеру (100 мс) — даём ему шанс долететь. */
async function flushCallbacks(ms = 250): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('HandleCibaChannelRequestUseCase', () => {
  let issuer: jest.Mocked<UserTokenIssuer>;
  let pendingMints: jest.Mocked<PendingMintStore>;
  let useCase: HandleCibaChannelRequestUseCase;

  beforeEach(() => {
    issuer = {
      startBackchannelAuth: jest.fn(),
      exchangeBackchannelAuth: jest.fn(),
      verifyChannelToken: jest.fn().mockResolvedValue({ userId: 'kc-1' }),
      completeBackchannelAuth: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserTokenIssuer>;
    pendingMints = {
      save: jest.fn(),
      consume: jest.fn().mockResolvedValue({
        loginHint: '+79991234567',
        keycloakId: 'kc-1',
        purpose: 'sign-in',
        phone: '+79991234567',
      }),
    } as unknown as jest.Mocked<PendingMintStore>;
    useCase = new HandleCibaChannelRequestUseCase(issuer, pendingMints);
  });

  it('approves a pending mint and completes the backchannel authentication after the response', async () => {
    const result = await useCase.execute(
      new HandleCibaChannelRequestCommand('Bearer channel-token', '+79991234567', BINDING),
    );

    expect(result).toEqual({ approved: true });
    expect(pendingMints.consume).toHaveBeenCalledWith(BINDING);
    // Callback — отдельный акт: он уходит после ответа 201, иначе Keycloak
    // отвергает его (403 invalid_token), пока сам ещё держит запрос канала.
    expect(issuer.completeBackchannelAuth).not.toHaveBeenCalled();

    await flushCallbacks();
    expect(issuer.completeBackchannelAuth).toHaveBeenCalledWith({
      authorizationHeader: 'Bearer channel-token',
      decision: 'SUCCEED',
    });
  });

  it('retries the callback while Keycloak is not ready to accept it', async () => {
    issuer.completeBackchannelAuth
      .mockRejectedValueOnce(new Error('403 invalid_token'))
      .mockResolvedValue(undefined);

    await useCase.execute(
      new HandleCibaChannelRequestCommand('Bearer channel-token', '+79991234567', BINDING),
    );

    await flushCallbacks(700);
    expect(issuer.completeBackchannelAuth).toHaveBeenCalledTimes(2);
  });

  it('denies a request without binding_message (our correlation key)', async () => {
    const result = await useCase.execute(
      new HandleCibaChannelRequestCommand('Bearer channel-token', '+79991234567', null),
    );

    expect(result).toEqual({ approved: false });
    expect(issuer.completeBackchannelAuth).not.toHaveBeenCalled();
  });

  it('denies an unknown or already used mint', async () => {
    pendingMints.consume.mockResolvedValue(null);

    const result = await useCase.execute(
      new HandleCibaChannelRequestCommand('Bearer channel-token', '+79991234567', BINDING),
    );

    expect(result).toEqual({ approved: false });
    expect(issuer.completeBackchannelAuth).not.toHaveBeenCalled();
  });

  it('denies when the notified subject is not the user we asked tokens for', async () => {
    issuer.verifyChannelToken.mockResolvedValue({ userId: 'kc-other' });

    const result = await useCase.execute(
      new HandleCibaChannelRequestCommand('Bearer channel-token', '+79991234567', BINDING),
    );

    expect(result).toEqual({ approved: false });
    expect(issuer.completeBackchannelAuth).not.toHaveBeenCalled();
  });

  it('propagates a rejected channel token so the controller answers non-201', async () => {
    issuer.verifyChannelToken.mockRejectedValue(new InvalidTokenError('Channel token is invalid'));

    await expect(
      useCase.execute(new HandleCibaChannelRequestCommand(null, '+79991234567', BINDING)),
    ).rejects.toThrow(InvalidTokenError);
    expect(pendingMints.consume).not.toHaveBeenCalled();
  });
});
