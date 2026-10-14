import { KeycloakEventListenerService } from '../../../src/modules/auth/infrastructure/keycloak/keycloak-event-listener.service';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { EventBus } from '../../../src/shared/application/event-bus.interface';

describe('KeycloakEventListenerService', () => {
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let eventBus: jest.Mocked<EventBus>;
  let service: KeycloakEventListenerService;

  beforeEach(() => {
    identityAdmin = {
      createEmailUser: jest.fn(),
      findByEmail: jest.fn(),
      sendVerifyEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
      findEmailVerificationEvents: jest.fn().mockResolvedValue([]),
      createPhoneUser: jest.fn(),
      findByUsername: jest.fn(),
    };
    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      publishAll: jest.fn(),
      subscribe: jest.fn(),
    };
    service = new KeycloakEventListenerService(identityAdmin, eventBus);
  });

  it('publishes auth.email-verified for every event in the window', async () => {
    identityAdmin.findEmailVerificationEvents.mockResolvedValue([
      { keycloakId: 'kc-1', email: 'a@b.com', time: 111 },
      { keycloakId: 'kc-2', email: null, time: 112 },
    ]);

    await service.poll();

    expect(eventBus.publish).toHaveBeenCalledTimes(2);
    const first = (eventBus.publish as jest.Mock).mock.calls[0][0];
    expect(first.eventName).toBe('auth.email-verified');
    expect(first.payload).toEqual({ keycloakId: 'kc-1', email: 'a@b.com' });
  });

  it('does not publish the same event twice (polling re-reads the window)', async () => {
    identityAdmin.findEmailVerificationEvents.mockResolvedValue([
      { keycloakId: 'kc-1', email: null, time: 111 },
    ]);

    await service.poll();
    await service.poll();

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('survives a Keycloak failure and keeps polling afterwards', async () => {
    identityAdmin.findEmailVerificationEvents.mockRejectedValueOnce(
      new Error('503 Service Unavailable'),
    );

    await expect(service.poll()).resolves.toBeUndefined();
    expect(eventBus.publish).not.toHaveBeenCalled();

    identityAdmin.findEmailVerificationEvents.mockResolvedValue([
      { keycloakId: 'kc-3', email: null, time: 200 },
    ]);
    await service.poll();

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });
});
