import { ConfigService } from '@nestjs/config';
import { ContactDriftDetectorService } from '../../../src/modules/auth/application/services/contact-drift-detector.service';
import {
  IdentityAdminPort,
  IdentityAdminUser,
} from '../../../src/modules/auth/domain/ports/identity-admin.port';
import {
  UserContacts,
  UserContactsSnapshot,
} from '../../../src/shared/application/user-contacts.interface';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

function shadow(overrides: Partial<UserContactsSnapshot> = {}): UserContactsSnapshot {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    keycloakId: KC_ID,
    email: 'user@example.com',
    phone: '+79990000124',
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

function identity(overrides: Partial<IdentityAdminUser> = {}): IdentityAdminUser {
  return {
    keycloakId: KC_ID,
    username: 'usr_0123456789abcdef',
    phone: '+79990000124',
    phoneVerified: true,
    email: 'user@example.com',
    emailVerified: true,
    firstName: 'Путь',
    lastName: 'Би',
    ...overrides,
  };
}

function build(config: Record<string, unknown> = {}): {
  detector: ContactDriftDetectorService;
  contacts: jest.Mocked<UserContacts>;
  identityAdmin: jest.Mocked<IdentityAdminPort>;
} {
  const values: Record<string, unknown> = {
    CONTACT_DRIFT_DETECTOR_ENABLED: 'true',
    CONTACT_DRIFT_HEAL_ENABLED: 'true',
    CONTACT_DRIFT_DETECTOR_INTERVAL_SECONDS: '1800',
    ...config,
  };

  const contacts = {
    normalize: jest.fn(),
    find: jest.fn(),
    listForReconciliation: jest.fn().mockResolvedValue([shadow()]),
    isContactTaken: jest.fn(),
    applyVerifiedChange: jest.fn(),
    rollback: jest.fn(),
  } as unknown as jest.Mocked<UserContacts>;

  const identityAdmin = {
    findById: jest.fn().mockResolvedValue(identity()),
    updateContacts: jest.fn(),
  } as unknown as jest.Mocked<IdentityAdminPort>;

  const configService = { get: (key: string) => values[key] } as unknown as ConfigService;

  return {
    detector: new ContactDriftDetectorService(contacts, identityAdmin, configService),
    contacts,
    identityAdmin,
  };
}

describe('ContactDriftDetectorService (ADR-0017 §3)', () => {
  it('согласованные системы: ничего не пишем', async () => {
    const { detector, identityAdmin } = build();

    const summary = await detector.scanOnce();

    expect(summary).toEqual({ scanned: 1, drifted: 0, healed: 0, failed: 0 });
    expect(identityAdmin.updateContacts).not.toHaveBeenCalled();
  });

  it('Keycloak отстал от shadow: пишем полное состояние контактов', async () => {
    const { detector, identityAdmin } = build();
    identityAdmin.findById.mockResolvedValue(identity({ phone: null, phoneVerified: false }));

    const summary = await detector.scanOnce();

    expect(summary).toEqual({ scanned: 1, drifted: 1, healed: 1, failed: 0 });
    expect(identityAdmin.updateContacts).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      email: 'user@example.com',
      emailVerified: true,
      phone: '+79990000124',
      phoneVerified: true,
    });
  });

  it('в Keycloak лишний телефон, которого нет в shadow: чистим атрибуты', async () => {
    const { detector, contacts, identityAdmin } = build();
    contacts.listForReconciliation.mockResolvedValue([
      shadow({ phone: null, phoneVerifiedAt: null }),
    ]);

    const summary = await detector.scanOnce();

    expect(summary.drifted).toBe(1);
    expect(identityAdmin.updateContacts).toHaveBeenCalledWith({
      keycloakId: KC_ID,
      email: 'user@example.com',
      emailVerified: true,
      phone: null,
      phoneVerified: false,
    });
  });

  it('расходится только флаг подтверждения письма — тоже лечим', async () => {
    const { detector, identityAdmin } = build();
    identityAdmin.findById.mockResolvedValue(identity({ emailVerified: false }));

    const summary = await detector.scanOnce();

    expect(summary).toEqual({ scanned: 1, drifted: 1, healed: 1, failed: 0 });
  });

  it('report-only (heal выключен): сообщаем, но не пишем', async () => {
    const { detector, identityAdmin } = build({ CONTACT_DRIFT_HEAL_ENABLED: 'false' });
    identityAdmin.findById.mockResolvedValue(identity({ email: 'other@example.com' }));

    const summary = await detector.scanOnce();

    expect(summary).toEqual({ scanned: 1, drifted: 1, healed: 0, failed: 0 });
    expect(identityAdmin.updateContacts).not.toHaveBeenCalled();
  });

  it('identity нет в Keycloak: считаем расхождением, но не лечим автоматически', async () => {
    const { detector, identityAdmin } = build();
    identityAdmin.findById.mockResolvedValue(null);

    const summary = await detector.scanOnce();

    expect(summary).toEqual({ scanned: 1, drifted: 1, healed: 0, failed: 0 });
    expect(identityAdmin.updateContacts).not.toHaveBeenCalled();
  });

  it('ошибка починки не роняет проход: пользователи обрабатываются дальше', async () => {
    const { detector, contacts, identityAdmin } = build();
    identityAdmin.findById.mockResolvedValue(identity({ email: 'other@example.com' }));
    identityAdmin.updateContacts.mockRejectedValue(new Error('kc down'));
    contacts.listForReconciliation.mockResolvedValue([shadow(), shadow({ id: 'other-id' })]);

    const summary = await detector.scanOnce();

    expect(summary).toEqual({ scanned: 2, drifted: 2, healed: 0, failed: 2 });
  });

  it('идёт по страницам keyset-курсором, пока страница полная', async () => {
    const { detector, contacts } = build();
    const fullPage = Array.from({ length: 100 }, (_, index) => shadow({ id: `id-${index}` }));
    contacts.listForReconciliation
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([shadow({ id: 'id-last' })]);

    const summary = await detector.scanOnce();

    expect(summary.scanned).toBe(101);
    expect(contacts.listForReconciliation).toHaveBeenNthCalledWith(1, {
      afterId: null,
      limit: 100,
    });
    expect(contacts.listForReconciliation).toHaveBeenNthCalledWith(2, {
      afterId: 'id-99',
      limit: 100,
    });
  });

  it('таймер: ставится при enabled, снимается при destroy, не ставится при enabled=false', () => {
    jest.useFakeTimers();
    const setSpy = jest.spyOn(global, 'setInterval');
    const clearSpy = jest.spyOn(global, 'clearInterval');

    const on = build().detector;
    on.onModuleInit();
    expect(setSpy).toHaveBeenCalledTimes(1);

    on.onModuleDestroy();
    expect(clearSpy).toHaveBeenCalledTimes(1);

    const off = build({ CONTACT_DRIFT_DETECTOR_ENABLED: 'false' }).detector;
    off.onModuleInit();
    expect(setSpy).toHaveBeenCalledTimes(1);

    setSpy.mockRestore();
    clearSpy.mockRestore();
    jest.useRealTimers();
  });
});
