// `jwks-rsa` тянет ESM-`jose`, который ts-jest не парсит (в приложении это
// работает: Node 24 умеет require(esm)). Для юнит-теста адаптера подменяем его —
// реальная проверка подписи покрывается живым acceptance.
jest.mock('jwks-rsa', () => ({ JwksClient: jest.fn() }));

import { ConfigService } from '@nestjs/config';
import { KeycloakCibaAdapter } from '../../src/modules/auth/infrastructure/keycloak/keycloak-ciba.adapter';
import { KeycloakHttpClient } from '../../src/modules/auth/infrastructure/keycloak/keycloak-http.client';
import { KeycloakJwtVerifier } from '../../src/modules/auth/infrastructure/keycloak/keycloak-jwt.verifier';
import { InvalidTokenError } from '../../src/modules/auth/domain/errors/invalid-token.error';

function build(options: { azp?: string; sub?: string } = {}) {
  const http = {
    backchannelAuth: jest.fn().mockResolvedValue({ auth_req_id: 'req-1', expires_in: 120 }),
    cibaGrant: jest.fn().mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 300,
      refresh_expires_in: 1800,
      token_type: 'Bearer',
    }),
    cibaCallback: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<KeycloakHttpClient>;
  const verifier = {
    verify: jest.fn().mockResolvedValue({
      sub: options.sub ?? 'kc-1',
      azp: options.azp ?? 'app-backend',
    }),
  } as unknown as jest.Mocked<KeycloakJwtVerifier>;
  const config = { get: () => 'app-backend' } as unknown as ConfigService;
  return { adapter: new KeycloakCibaAdapter(http, verifier, config), http, verifier };
}

describe('KeycloakCibaAdapter', () => {
  it('starts a backchannel auth and defaults the poll interval to 5s', async () => {
    const { adapter, http } = build();

    const started = await adapter.startBackchannelAuth({
      loginHint: '+79991234567',
      bindingMessage: 'b-1',
    });

    expect(started).toEqual({ authReqId: 'req-1', intervalSeconds: 5 });
    expect(http.backchannelAuth).toHaveBeenCalledWith({
      loginHint: '+79991234567',
      bindingMessage: 'b-1',
    });
  });

  it('exchanges the request for a domain token pair', async () => {
    const { adapter } = build();

    await expect(adapter.exchangeBackchannelAuth('req-1', 0)).resolves.toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 300,
    });
  });

  it('retries while Keycloak says the authorization is still pending', async () => {
    const { adapter, http } = build();
    http.cibaGrant
      .mockRejectedValueOnce({ response: { data: { error: 'authorization_pending' } } })
      .mockResolvedValue({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
      });

    await expect(adapter.exchangeBackchannelAuth('req-1', 0)).resolves.toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 300,
    });
    expect(http.cibaGrant).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('backs off by 5s per RFC when Keycloak asks to slow down', async () => {
    jest.useFakeTimers();
    try {
      const { adapter, http } = build();
      http.cibaGrant
        .mockRejectedValueOnce({ response: { data: { error: 'slow_down' } } })
        .mockResolvedValue({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 300,
          refresh_expires_in: 1800,
          token_type: 'Bearer',
        });

      const tokens = adapter.exchangeBackchannelAuth('req-1', 0);
      await jest.advanceTimersByTimeAsync(6_000);

      await expect(tokens).resolves.toMatchObject({ accessToken: 'at' });
      expect(http.cibaGrant).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('verifies the channel token and returns the subject', async () => {
    const { adapter, verifier } = build();

    await expect(adapter.verifyChannelToken('Bearer tok')).resolves.toEqual({ userId: 'kc-1' });
    expect(verifier.verify).toHaveBeenCalledWith('tok');
  });

  it('rejects a channel token issued for another client (azp guard)', async () => {
    const { adapter } = build({ azp: 'some-other-client' });

    await expect(adapter.verifyChannelToken('Bearer tok')).rejects.toThrow(InvalidTokenError);
  });

  it('rejects a missing or non-bearer authorization header', async () => {
    const { adapter } = build();

    await expect(adapter.verifyChannelToken(null)).rejects.toThrow(InvalidTokenError);
    await expect(adapter.verifyChannelToken('Basic abc')).rejects.toThrow(InvalidTokenError);
  });

  it('completes the backchannel auth with the same bearer token', async () => {
    const { adapter, http } = build();

    await adapter.completeBackchannelAuth({ authorizationHeader: 'Bearer tok', decision: 'SUCCEED' });

    expect(http.cibaCallback).toHaveBeenCalledWith({ channelToken: 'tok', decision: 'SUCCEED' });
  });
});
