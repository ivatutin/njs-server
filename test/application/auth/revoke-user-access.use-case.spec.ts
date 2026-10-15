import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { TokenStorePort } from '../../../src/modules/auth/domain/ports/token-store.port';
import { RevokeUserAccessCommand } from '../../../src/modules/auth/application/use-cases/revoke-user-access/revoke-user-access.command';
import { RevokeUserAccessUseCase } from '../../../src/modules/auth/application/use-cases/revoke-user-access/revoke-user-access.use-case';

const KC_ID = 'a350af07-f892-4b5a-8502-a72d2bb8aa5d';
/** 300 (env) + 60 (запас ADR-0018, C4). */
const EXPECTED_MARKER_TTL = 360;

function build(envTtl: unknown = 300) {
  const identityAdmin = {
    logoutAllSessions: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IdentityAdminPort>;
  const tokenStore = {
    revokeUserTokens: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<TokenStorePort>;
  const config = { get: () => envTtl } as unknown as ConfigService;
  return {
    useCase: new RevokeUserAccessUseCase(identityAdmin, tokenStore, config),
    identityAdmin,
    tokenStore,
  };
}

describe('RevokeUserAccessUseCase', () => {
  it('kills Keycloak sessions and then sets the sub marker (order matters)', async () => {
    const { useCase, identityAdmin, tokenStore } = build();

    await useCase.execute(new RevokeUserAccessCommand(KC_ID, 'password-change'));

    expect(identityAdmin.logoutAllSessions).toHaveBeenCalledWith(KC_ID);
    expect(tokenStore.revokeUserTokens).toHaveBeenCalledWith(KC_ID, EXPECTED_MARKER_TTL);
    // Сначала то, что нельзя обойти refresh'ем, и только потом метка.
    expect(identityAdmin.logoutAllSessions.mock.invocationCallOrder[0]).toBeLessThan(
      tokenStore.revokeUserTokens.mock.invocationCallOrder[0],
    );
  });

  it('fails with 503 and does NOT set the marker when Keycloak logout fails', async () => {
    const { useCase, identityAdmin, tokenStore } = build();
    identityAdmin.logoutAllSessions.mockRejectedValue(new Error('KC down'));

    await expect(
      useCase.execute(new RevokeUserAccessCommand(KC_ID, 'contact-change')),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(tokenStore.revokeUserTokens).not.toHaveBeenCalled();
  });

  it('fails with 503 when the Redis marker cannot be set', async () => {
    const { useCase, tokenStore } = build();
    tokenStore.revokeUserTokens.mockRejectedValue(new Error('Redis down'));

    await expect(
      useCase.execute(new RevokeUserAccessCommand(KC_ID, 'logout-everywhere')),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('falls back to the default access TTL when the env value is missing', async () => {
    const { useCase, tokenStore } = build(undefined);

    await useCase.execute(new RevokeUserAccessCommand(KC_ID, 'admin-suspend'));

    expect(tokenStore.revokeUserTokens).toHaveBeenCalledWith(KC_ID, EXPECTED_MARKER_TTL);
  });
});
