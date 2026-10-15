import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import {
  LOGIN_HANDLE_RESOLVER,
  LoginHandleResolver,
} from '@shared/application/login-handle.interface';
import { EVENT_BUS, EventBus } from '@shared/application/event-bus.interface';
import {
  IDENTITY_PROVIDER,
  IdentityProviderPort,
  TokenPair,
} from '../../../domain/ports/identity-provider.port';
import { UserSignedInEvent } from '../../../domain/events/user-signed-in.event';
import { SignInCommand } from './sign-in.command';

@Injectable()
export class SignInUseCase implements UseCase<SignInCommand, TokenPair> {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProviderPort,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(LOGIN_HANDLE_RESOLVER) private readonly handles: LoginHandleResolver,
  ) {}

  async execute(cmd: SignInCommand): Promise<TokenPair> {
    // В Keycloak передаём handle (путь B, ADR-0017 ред.2); фолбэк — сам email:
    // `loginWithEmailAllowed=true` резолвит его по атрибуту `email`.
    const handle = await this.handles.byEmail(cmd.email);
    const tokens = await this.idp.signIn(handle ?? cmd.email, cmd.password);
    const claims = await this.idp.verifyAccessToken(tokens.accessToken);

    // Cross-module coordination: User module will upsert local row.
    await this.eventBus.publish(
      new UserSignedInEvent({
        keycloakId: claims.sub,
        email: claims.email,
        roles: claims.roles,
      }),
    );

    return tokens;
  }
}
