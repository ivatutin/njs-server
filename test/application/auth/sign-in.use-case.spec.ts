import { SignInUseCase } from '../../../src/modules/auth/application/use-cases/sign-in/sign-in.use-case';
import { SignInCommand } from '../../../src/modules/auth/application/use-cases/sign-in/sign-in.command';
import { IdentityProviderPort } from '../../../src/modules/auth/domain/ports/identity-provider.port';
import { EventBus } from '../../../src/shared/application/event-bus.interface';

describe('SignInUseCase', () => {
  let idp: jest.Mocked<IdentityProviderPort>;
  let bus: jest.Mocked<EventBus>;
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
      }),
    };
    bus = {
      publish: jest.fn().mockResolvedValue(undefined),
      publishAll: jest.fn(),
      subscribe: jest.fn(),
    };
    useCase = new SignInUseCase(idp, bus);
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

  it('propagates IdentityProvider errors (e.g. InvalidCredentialsError)', async () => {
    const err = new Error('invalid');
    idp.signIn.mockRejectedValue(err);
    await expect(useCase.execute(new SignInCommand('x', 'y'))).rejects.toThrow(err);
    expect(bus.publish).not.toHaveBeenCalled();
  });
});
