import {
  AuthWarmupService,
  WarmupTarget,
} from '../../../src/modules/auth/application/services/auth-warmup.service';
import { KeycloakAdminClient } from '../../../src/shared/infrastructure/keycloak/keycloak-admin.client';

function build() {
  const adminClient = { warmUp: jest.fn().mockResolvedValue(undefined) };
  const verifier: jest.Mocked<WarmupTarget> = { warmUp: jest.fn().mockResolvedValue(undefined) };

  return {
    service: new AuthWarmupService(adminClient as unknown as KeycloakAdminClient, verifier),
    adminClient,
    verifier,
  };
}

describe('AuthWarmupService (batch-3: холодный путь)', () => {
  it('при старте греет и админ-токен, и JWKS', async () => {
    const { service, adminClient, verifier } = build();

    await service.onApplicationBootstrap();

    expect(adminClient.warmUp).toHaveBeenCalledTimes(1);
    expect(verifier.warmUp).toHaveBeenCalledTimes(1);
  });

  it('недоступный Keycloak не валит старт: ошибки прогрева проглатываются', async () => {
    const { service, adminClient, verifier } = build();
    adminClient.warmUp.mockRejectedValue(new Error('keycloak down'));
    verifier.warmUp.mockRejectedValue(new Error('keycloak down'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    // второй прогрев всё равно выполняется: отказ одного канала не отменяет другой
    expect(verifier.warmUp).toHaveBeenCalledTimes(1);
  });
});
