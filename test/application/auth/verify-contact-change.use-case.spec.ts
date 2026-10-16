import { ServiceUnavailableException } from '@nestjs/common';
import { OtpChallenges } from '../../../src/shared/application/otp-challenges.interface';
import {
  UserContacts,
  UserContactsSnapshot,
} from '../../../src/shared/application/user-contacts.interface';
import { VerifyContactChangeCommand } from '../../../src/modules/auth/application/use-cases/verify-contact-change/verify-contact-change.command';
import { VerifyContactChangeUseCase } from '../../../src/modules/auth/application/use-cases/verify-contact-change/verify-contact-change.use-case';
import { ChangeTokenExpiredError } from '../../../src/modules/auth/domain/errors/change-token-expired.error';
import { ContactChangeUnavailableError } from '../../../src/modules/auth/domain/errors/contact-change-unavailable.error';
import { ContactChangeRecord } from '../../../src/modules/auth/domain/ports/change-token-store.port';
import { ChangeTokenStore } from '../../../src/modules/auth/domain/ports/change-token-store.port';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { RevokeUserAccessUseCase } from '../../../src/modules/auth/application/use-cases/revoke-user-access/revoke-user-access.use-case';
import { ContactChangeNotifier } from '../../../src/shared/application/contact-change-notifier.interface';
import { UserNotFoundError } from '../../../src/shared/domain/errors/user-not-found.error';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

function record(overrides: Partial<ContactChangeRecord> = {}): ContactChangeRecord {
  return {
    keycloakId: KC_ID,
    channel: 'email',
    target: 'new@example.com',
    oldTarget: 'old@example.com',
    requiresOldChallenge: true,
    newChallengeId: 'ch-new',
    oldChallengeId: 'ch-old',
    status: 'pending',
    ...overrides,
  };
}

function user(overrides: Partial<UserContactsSnapshot> = {}): UserContactsSnapshot {
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

describe('VerifyContactChangeUseCase (ADR-0017, шаг 2)', () => {
  let changes: jest.Mocked<ChangeTokenStore>;
  let challenges: jest.Mocked<OtpChallenges>;
  let contacts: jest.Mocked<UserContacts>;
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let revokeAccess: jest.Mocked<RevokeUserAccessUseCase>;
  let notifier: jest.Mocked<ContactChangeNotifier>;
  let useCase: VerifyContactChangeUseCase;

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
    challenges = { start: jest.fn(), verify: jest.fn() } as unknown as jest.Mocked<OtpChallenges>;
    contacts = {
      normalize: jest.fn(),
      find: jest.fn().mockResolvedValue(user()),
      isContactTaken: jest.fn(),
      applyVerifiedChange: jest.fn().mockResolvedValue(user({ email: 'new@example.com' })),
      rollback: jest.fn(),
    } as unknown as jest.Mocked<UserContacts>;
    identityAdmin = {
      createEmailUser: jest.fn(),
      createPhoneUser: jest.fn(),
      findByUsername: jest.fn(),
      findById: jest.fn(),
      setPassword: jest.fn(),
      logoutAllSessions: jest.fn(),
      updateContacts: jest.fn(),
      findByEmail: jest.fn(),
      sendVerifyEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
      findEmailVerificationEvents: jest.fn(),
    } as unknown as jest.Mocked<IdentityAdminPort>;
    revokeAccess = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RevokeUserAccessUseCase>;
    notifier = {
      notifyChanged: jest.fn(),
    } as unknown as jest.Mocked<ContactChangeNotifier>;

    useCase = new VerifyContactChangeUseCase(
      changes,
      challenges,
      contacts,
      identityAdmin,
      revokeAccess,
      notifier,
    );
  });

  it('неизвестный changeToken — 422 ChangeTokenExpired', async () => {
    changes.find.mockResolvedValue(null);

    await expect(
      useCase.execute(new VerifyContactChangeCommand(KC_ID, 'tok', '123456', '654321')),
    ).rejects.toThrow(ChangeTokenExpiredError);

    expect(challenges.verify).not.toHaveBeenCalled();
    expect(revokeAccess.execute).not.toHaveBeenCalled();
  });

  it('повторный verify после успеха — идемпотентный 200 без применения', async () => {
    changes.find.mockResolvedValue(record({ status: 'applied' }));

    const result = await useCase.execute(
      new VerifyContactChangeCommand(KC_ID, 'tok', '123456', '654321'),
    );

    expect(result.user.email).toBe('old@example.com');
    expect(challenges.verify).not.toHaveBeenCalled();
    expect(contacts.applyVerifiedChange).not.toHaveBeenCalled();
    expect(identityAdmin.updateContacts).not.toHaveBeenCalled();
  });

  it('состояние failed — 503 без повторного применения', async () => {
    changes.find.mockResolvedValue(record({ status: 'failed', failureReason: 'drift' }));

    await expect(
      useCase.execute(new VerifyContactChangeCommand(KC_ID, 'tok', '123456', '654321')),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(contacts.applyVerifiedChange).not.toHaveBeenCalled();
  });

  it('успех: коды → отзыв доступа → shadow → Keycloak (verified) → applied', async () => {
    const result = await useCase.execute(
      new VerifyContactChangeCommand(KC_ID, 'tok', '123456', '654321'),
    );

    expect(challenges.verify).toHaveBeenNthCalledWith(1, {
      target: 'new@example.com',
      purpose: 'change-contact-new',
      code: '123456',
    });
    expect(challenges.verify).toHaveBeenNthCalledWith(2, {
      target: 'old@example.com',
      purpose: 'change-contact-old',
      code: '654321',
    });
    expect(contacts.applyVerifiedChange).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      email: 'new@example.com',
    });
    expect(identityAdmin.updateContacts).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      email: 'new@example.com',
      emailVerified: true,
    });
    expect(changes.markApplied).toHaveBeenCalledWith('tok');
    expect(result.user.email).toBe('new@example.com');
    expect(notifier.notifyChanged).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      channel: 'email',
      newValue: 'new@example.com',
      oldValue: 'old@example.com',
    });

    // Порядок координатора: отзыв доступа строго ДО применения.
    const revokeOrder = revokeAccess.execute.mock.invocationCallOrder[0];
    const applyOrder = contacts.applyVerifiedChange.mock.invocationCallOrder[0];
    const keycloakOrder = identityAdmin.updateContacts.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(applyOrder);
    expect(applyOrder).toBeLessThan(keycloakOrder);
  });

  it('смена телефона: в Keycloak уходит атрибут, второй код — только если требуется', async () => {
    changes.find.mockResolvedValue(
      record({ channel: 'phone', target: '+79990000122', requiresOldChallenge: false, oldTarget: null }),
    );

    await useCase.execute(new VerifyContactChangeCommand(KC_ID, 'tok', '123456'));

    expect(challenges.verify).toHaveBeenCalledTimes(1);
    expect(contacts.applyVerifiedChange).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      phone: '+79990000122',
    });
    expect(identityAdmin.updateContacts).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      phone: '+79990000122',
      phoneVerified: true,
    });
  });

  it('падение уведомления не превращает успешную смену в ошибку (best-effort)', async () => {
    notifier.notifyChanged.mockRejectedValue(new Error('smtp down'));

    const result = await useCase.execute(
      new VerifyContactChangeCommand(KC_ID, 'tok', '123456', '654321'),
    );

    expect(result.user.email).toBe('new@example.com');
    expect(changes.markApplied).toHaveBeenCalledWith('tok');
  });

  it('Keycloak не принял после ретраев → компенсация: откат shadow и 503 с живым changeToken', async () => {
    identityAdmin.updateContacts.mockRejectedValue(new Error('kc down'));

    await expect(
      useCase.execute(new VerifyContactChangeCommand(KC_ID, 'tok', '123456', '654321')),
    ).rejects.toThrow(ContactChangeUnavailableError);

    expect(identityAdmin.updateContacts).toHaveBeenCalledTimes(3);
    expect(contacts.rollback).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      email: 'old@example.com',
      phone: '+79990000106',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
      phoneVerifiedAt: '2026-01-01T00:00:00.000Z',
    });
    // Состояние остаётся pending: B2-1 — «ничего не применено, повтор разрешён».
    expect(changes.markFailed).not.toHaveBeenCalled();
    expect(changes.markApplied).not.toHaveBeenCalled();
  });

  it('не удалась и компенсация → инцидент: смена помечается failed, повтор не применяет', async () => {
    identityAdmin.updateContacts.mockRejectedValue(new Error('kc down'));
    contacts.rollback.mockRejectedValue(new Error('db down'));

    await expect(
      useCase.execute(new VerifyContactChangeCommand(KC_ID, 'tok', '123456', '654321')),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(changes.markFailed).toHaveBeenCalledWith(
      'tok',
      expect.stringContaining('rollback failed'),
    );
    expect(changes.markApplied).not.toHaveBeenCalled();
  });
});
