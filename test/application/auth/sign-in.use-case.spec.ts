import { SignInUseCase } from '../../../src/modules/auth/application/use-cases/sign-in/sign-in.use-case';
import { SignInCommand } from '../../../src/modules/auth/application/use-cases/sign-in/sign-in.command';
import { LoginHandleResolver } from '../../../src/shared/application/login-handle.interface';
import { IdentityProviderPort } from '../../../src/modules/auth/domain/ports/identity-provider.port';
import { IdentityAdminPort } from '../../../src/modules/auth/domain/ports/identity-admin.port';
import { EventBus } from '../../../src/shared/application/event-bus.interface';

describe('SignInUseCase', () => {
  let idp: jest.Mocked<IdentityProviderPort>;
  let bus: jest.Mocked<EventBus>;
  let identityAdmin: jest.Mocked<IdentityAdminPort>;
  let useCase: SignInUseCase;

  beforeEach(() => {
    idp = {
      signIn: jest.fn().mockResolvedValue({
        accessToken: 'at.jwt',
        refreshToken: 'rt.jwt',
        expiresIn: 300,
      }),
      refresh: jest.fn(),
      signOut: jest.fn(),
      verifyAccessToken: jest.fn().mockResolvedValue({
        sub: 'kc-uuid',
        email: 'a@b.com',
        roles: ['user'],
        issuedAt: 0,
      }),
    };
    bus = {
      publish: jest.fn().mockResolvedValue(undefined),
      publishAll: jest.fn(),
      subscribe: jest.fn(),
    };
    identityAdmin = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IdentityAdminPort>;
    const handles = {
      byPhone: jest.fn(),
      byEmail: jest.fn().mockResolvedValue(null),
      byKeycloakId: jest.fn(),
    } as unknown as jest.Mocked<LoginHandleResolver>;
    useCase = new SignInUseCase(idp, bus, handles, identityAdmin);
  });

  it('returns token pair and publishes UserSignedInEvent', async () => {
    const tokens = await useCase.execute(new SignInCommand('a@b.com', 'pwd'));
    expect(tokens).toEqual({ accessToken: 'at.jwt', refreshToken: 'rt.jwt', expiresIn: 300 });
    expect(idp.signIn).toHaveBeenCalledWith('a@b.com', 'pwd');
    expect(idp.verifyAccessToken).toHaveBeenCalledWith('at.jwt');
    expect(bus.publish).toHaveBeenCalledTimes(1);
    const published = (bus.publish as jest.Mock).mock.calls[0][0];
    expect(published.eventName).toBe('auth.user-signed-in');
    expect(published.payload).toEqual({ keycloakId: 'kc-uuid', email: 'a@b.com', roles: ['user'] });
  });

  it('publishes the name from Keycloak (contract v1.6)', async () => {
    identityAdmin.findById.mockResolvedValue({
      keycloakId: 'kc-uuid',
      email: 'a@b.com',
      emailVerified: true,
      firstName: 'Jane',
      lastName: 'Doe',
      phone: null,
      phoneVerified: false,
    });

    await useCase.execute(new SignInCommand('a@b.com', 'pwd'));

    const published = (bus.publish as jest.Mock).mock.calls[0][0];
    expect(published.payload).toEqual({
      keycloakId: 'kc-uuid',
      email: 'a@b.com',
      roles: ['user'],
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('does not fail the sign-in when the profile lookup fails (name is best-effort)', async () => {
    identityAdmin.findById.mockRejectedValue(new Error('keycloak down'));

    const tokens = await useCase.execute(new SignInCommand('a@b.com', 'pwd'));

    expect(tokens.accessToken).toBe('at.jwt');
    const published = (bus.publish as jest.Mock).mock.calls[0][0];
    // имени нет — хендлер не будет трогать shadow
    expect(published.payload).not.toHaveProperty('firstName');
    expect(published.payload).not.toHaveProperty('lastName');
  });

  it('propagates IdentityProvider errors (e.g. InvalidCredentialsError)', async () => {
    const err = new Error('invalid');
    idp.signIn.mockRejectedValue(err);
    await expect(useCase.execute(new SignInCommand('x', 'y'))).rejects.toThrow(err);
    expect(bus.publish).not.toHaveBeenCalled();
  });
});
