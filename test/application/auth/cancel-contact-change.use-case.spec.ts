import { CancelContactChangeCommand } from '../../../src/modules/auth/application/use-cases/cancel-contact-change/cancel-contact-change.command';
import { CancelContactChangeUseCase } from '../../../src/modules/auth/application/use-cases/cancel-contact-change/cancel-contact-change.use-case';
import { ChangeTokenExpiredError } from '../../../src/modules/auth/domain/errors/change-token-expired.error';
import {
  ChangeTokenStore,
  ContactChangeRecord,
} from '../../../src/modules/auth/domain/ports/change-token-store.port';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

function record(overrides: Partial<ContactChangeRecord> = {}): ContactChangeRecord {
  return {
    keycloakId: KC_ID,
    channel: 'email',
    target: 'new@example.com',
    oldTarget: null,
    requiresOldChallenge: false,
    newChallengeId: 'ch-new',
    oldChallengeId: null,
    status: 'pending',
    ...overrides,
  };
}

describe('CancelContactChangeUseCase (ADR-0017 §5)', () => {
  let changes: jest.Mocked<ChangeTokenStore>;
  let useCase: CancelContactChangeUseCase;

  beforeEach(() => {
    changes = {
      create: jest.fn(),
      find: jest.fn().mockResolvedValue(record()),
      hasActive: jest.fn(),
      markApplied: jest.fn(),
      markFailed: jest.fn(),
      remove: jest.fn(),
      consumeUserQuota: jest.fn(),
    } as unknown as jest.Mocked<ChangeTokenStore>;

    useCase = new CancelContactChangeUseCase(changes);
  });

  it('снимает смену: удаляет запись и слот (штатный путь перевыпуска кода)', async () => {
    await useCase.execute(new CancelContactChangeCommand(KC_ID, 'tok-1'));

    expect(changes.remove).toHaveBeenCalledWith('tok-1');
  });

  it('неизвестный токен — 422 ChangeTokenExpired, ничего не снимаем', async () => {
    changes.find.mockResolvedValue(null);

    await expect(useCase.execute(new CancelContactChangeCommand(KC_ID, 'tok-1'))).rejects.toThrow(
      ChangeTokenExpiredError,
    );
    expect(changes.remove).not.toHaveBeenCalled();
  });

  it('чужой токен — 422 (не подтверждаем существование чужой смены)', async () => {
    changes.find.mockResolvedValue(record({ keycloakId: 'someone-else' }));

    await expect(useCase.execute(new CancelContactChangeCommand(KC_ID, 'tok-1'))).rejects.toThrow(
      ChangeTokenExpiredError,
    );
    expect(changes.remove).not.toHaveBeenCalled();
  });

  it('смена в терминальном состоянии тоже снимается (слот освобождается)', async () => {
    changes.find.mockResolvedValue(record({ status: 'applied' }));

    await useCase.execute(new CancelContactChangeCommand(KC_ID, 'tok-1'));

    expect(changes.remove).toHaveBeenCalledWith('tok-1');
  });
});
