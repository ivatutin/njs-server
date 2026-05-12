import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
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
  ) {}

  async execute(cmd: SignInCommand): Promise<TokenPair> {
    const tokens = await this.idp.signIn(cmd.email, cmd.password);
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
