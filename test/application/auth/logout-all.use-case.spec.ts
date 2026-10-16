import { ServiceUnavailableException } from '@nestjs/common';
import { LogoutAllCommand } from '../../../src/modules/auth/application/use-cases/logout-all/logout-all.command';
import { LogoutAllUseCase } from '../../../src/modules/auth/application/use-cases/logout-all/logout-all.use-case';
import { RevokeUserAccessUseCase } from '../../../src/modules/auth/application/use-cases/revoke-user-access/revoke-user-access.use-case';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

function build() {
  const revoke = {
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<RevokeUserAccessUseCase>;

  return { useCase: new LogoutAllUseCase(revoke), revoke };
}

describe('LogoutAllUseCase (контракт v1.4, ADR-0018)', () => {
  it('выход со всех устройств = отзыв доступа по sub с reason logout-everywhere', async () => {
    const { useCase, revoke } = build();

    await useCase.execute(new LogoutAllCommand(KC_ID));

    expect(revoke.execute).toHaveBeenCalledTimes(1);
    const cmd = revoke.execute.mock.calls[0][0];
    expect(cmd.keycloakId).toBe(KC_ID);
    // Причина важна: 'sign-out' здесь был бы обычным выходом на одном устройстве.
    expect(cmd.reason).toBe('logout-everywhere');
  });

  it('отказ инфраструктуры (503) пробрасывается наружу: сессии не погашены, повтор безопасен', async () => {
    const { useCase, revoke } = build();
    // Метку не выставляет сам отзыв (там шаг KC → метка, оба не best-effort) — use case не глотает ошибку.
    revoke.execute.mockRejectedValue(new ServiceUnavailableException('Access revocation failed'));

    await expect(useCase.execute(new LogoutAllCommand(KC_ID))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('идемпотентен: повторный вызов снова уходит в отзыв и не требует состояния', async () => {
    const { useCase, revoke } = build();

    await useCase.execute(new LogoutAllCommand(KC_ID));
    await useCase.execute(new LogoutAllCommand(KC_ID));

    expect(revoke.execute).toHaveBeenCalledTimes(2);
  });
});
