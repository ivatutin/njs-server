import { OtpChallenges } from '../../../src/shared/application/otp-challenges.interface';
import {
  UserContacts,
  UserContactsSnapshot,
} from '../../../src/shared/application/user-contacts.interface';
import { RequestContactChangeCommand } from '../../../src/modules/auth/application/use-cases/request-contact-change/request-contact-change.command';
import { RequestContactChangeUseCase } from '../../../src/modules/auth/application/use-cases/request-contact-change/request-contact-change.use-case';
import { ContactChangeAlreadyPendingError } from '../../../src/modules/auth/domain/errors/contact-change-already-pending.error';
import { ChangeTokenStore } from '../../../src/modules/auth/domain/ports/change-token-store.port';
import { ContactAlreadyExistsError } from '../../../src/shared/domain/errors/contact-already-exists.error';
import { OtpRateLimitedError } from '../../../src/shared/domain/errors/otp-rate-limited.error';
import { UserNotFoundError } from '../../../src/shared/domain/errors/user-not-found.error';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

function snapshot(overrides: Partial<UserContactsSnapshot> = {}): UserContactsSnapshot {
  return {
    id: 'u-1',
    keycloakId: KC_ID,
    email: 'old@example.com',
    phone: '+79990000106',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
    firstName: null,
    lastName: null,
    roles: [],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RequestContactChangeUseCase (ADR-0017, шаг 1)', () => {
  let contacts: jest.Mocked<UserContacts>;
  let challenges: jest.Mocked<OtpChallenges>;
  let changes: jest.Mocked<ChangeTokenStore>;
  let useCase: RequestContactChangeUseCase;

  beforeEach(() => {
    contacts = {
      normalize: jest.fn((channel: string, value: string) =>
        channel === 'email' ? value.trim().toLowerCase() : value,
      ),
      find: jest.fn().mockResolvedValue(snapshot()),
      isContactTaken: jest.fn().mockResolvedValue(false),
      applyVerifiedChange: jest.fn(),
      rollback: jest.fn(),
    } as unknown as jest.Mocked<UserContacts>;
    challenges = {
      start: jest
        .fn()
        .mockResolvedValueOnce({ challengeId: 'ch-new', expiresAt: '2026-01-01T00:05:00.000Z' })
        .mockResolvedValue({ challengeId: 'ch-old', expiresAt: '2026-01-01T00:05:00.000Z' }),
      verify: jest.fn(),
    } as unknown as jest.Mocked<OtpChallenges>;
    changes = {
      create: jest.fn().mockResolvedValue({ token: 'tok-1', expiresAt: new Date() }),
      find: jest.fn(),
      hasActive: jest.fn(),
      markApplied: jest.fn(),
      markFailed: jest.fn(),
      remove: jest.fn(),
      consumeUserQuota: jest.fn().mockResolvedValue({ allowed: true }),
    } as unknown as jest.Mocked<ChangeTokenStore>;

    useCase = new RequestContactChangeUseCase(contacts, challenges, changes);
  });

  it('смена email: подтверждаем старый контакт и стартуем два челленджа', async () => {
    const result = await useCase.execute(
      new RequestContactChangeCommand(KC_ID, 'email', 'New@Example.com'),
    );

    expect(result).toEqual({
      changeToken: 'tok-1',
      requiresOldChallenge: true,
      oldChallengeId: 'ch-old',
      newChallengeId: 'ch-new',
    });
    expect(challenges.start).toHaveBeenNthCalledWith(1, {
      channel: 'email',
      target: 'new@example.com',
      purpose: 'change-contact-new',
      ip: null,
    });
    expect(challenges.start).toHaveBeenNthCalledWith(2, {
      channel: 'email',
      target: 'old@example.com',
      purpose: 'change-contact-old',
      ip: null,
    });
    expect(changes.create).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      channel: 'email',
      target: 'new@example.com',
      oldTarget: 'old@example.com',
      requiresOldChallenge: true,
      newChallengeId: 'ch-new',
      oldChallengeId: 'ch-old',
    });
  });

  it('смена телефона при неподтверждённом старом: второй код уходит на подтверждённый email', async () => {
    contacts.find.mockResolvedValue(snapshot({ phone: '+79990000109', phoneVerifiedAt: null }));

    await useCase.execute(new RequestContactChangeCommand(KC_ID, 'phone', '+79990000122'));

    expect(challenges.start).toHaveBeenNthCalledWith(2, {
      channel: 'email',
      target: 'old@example.com',
      purpose: 'change-contact-old',
      ip: null,
    });
  });

  it('нет подтверждённых контактов: второй челлендж не нужен', async () => {
    contacts.find.mockResolvedValue(
      snapshot({ emailVerifiedAt: null, phoneVerifiedAt: null, email: null }),
    );

    const result = await useCase.execute(
      new RequestContactChangeCommand(KC_ID, 'phone', '+79990000122'),
    );

    expect(result.requiresOldChallenge).toBe(false);
    expect(result.oldChallengeId).toBeNull();
    expect(challenges.start).toHaveBeenCalledTimes(1);
    expect(changes.create).toHaveBeenCalledWith(
      expect.objectContaining({ oldTarget: null, oldChallengeId: null }),
    );
  });

  it('контакт совпадает с текущим — 409 и ни одного кода', async () => {
    await expect(
      useCase.execute(new RequestContactChangeCommand(KC_ID, 'email', 'OLD@example.com')),
    ).rejects.toThrow(ContactAlreadyExistsError);

    expect(challenges.start).not.toHaveBeenCalled();
    expect(changes.create).not.toHaveBeenCalled();
  });

  it('контакт занят другим пользователем — 409 до отправки кодов', async () => {
    contacts.isContactTaken.mockResolvedValue(true);

    await expect(
      useCase.execute(new RequestContactChangeCommand(KC_ID, 'phone', '+79990000122')),
    ).rejects.toThrow(ContactAlreadyExistsError);

    expect(challenges.start).not.toHaveBeenCalled();
  });

  it('личный лимит исчерпан — 422 OtpRateLimited без отправки кодов', async () => {
    changes.consumeUserQuota.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 });

    await expect(
      useCase.execute(new RequestContactChangeCommand(KC_ID, 'email', 'new@example.com')),
    ).rejects.toThrow(OtpRateLimitedError);

    expect(challenges.start).not.toHaveBeenCalled();
  });

  it('пользователя нет в shadow — 404', async () => {
    contacts.find.mockResolvedValue(null);

    await expect(
      useCase.execute(new RequestContactChangeCommand(KC_ID, 'email', 'new@example.com')),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('активная смена уже есть — 422 ContactChangeAlreadyPending до отправки кодов', async () => {
    changes.hasActive.mockResolvedValue(true);

    await expect(
      useCase.execute(new RequestContactChangeCommand(KC_ID, 'email', 'new@example.com')),
    ).rejects.toThrow(ContactChangeAlreadyPendingError);

    expect(challenges.start).not.toHaveBeenCalled();
    expect(changes.consumeUserQuota).not.toHaveBeenCalled();
  });

  it('активная смена уже есть — пробрасывает ContactChangeAlreadyPending', async () => {
    changes.create.mockRejectedValue(new ContactChangeAlreadyPendingError());

    await expect(
      useCase.execute(new RequestContactChangeCommand(KC_ID, 'email', 'new@example.com')),
    ).rejects.toThrow(ContactChangeAlreadyPendingError);
  });
});
