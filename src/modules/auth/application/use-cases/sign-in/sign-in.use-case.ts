import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import { UserSignedInEvent } from '../../../domain/events/user-signed-in.event';
import { SignInCommand } from './sign-in.command';

@Injectable()
export class SignInUseCase implements UseCase<SignInCommand, TokenPair> {
  private readonly logger = new Logger(SignInUseCase.name);

  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProviderPort,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(LOGIN_HANDLE_RESOLVER) private readonly handles: LoginHandleResolver,
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
  ) {}

  async execute(cmd: SignInCommand): Promise<TokenPair> {
    // В Keycloak передаём handle (путь B, ADR-0017 ред.2); фолбэк — сам email:
    // `loginWithEmailAllowed=true` резолвит его по атрибуту `email`.
    const handle = await this.handles.byEmail(cmd.email);
    const tokens = await this.idp.signIn(handle ?? cmd.email, cmd.password);
    const claims = await this.idp.verifyAccessToken(tokens.accessToken);

    // Имя — из Keycloak (контракт v1.6): там источник истины, там же оно спрашивается
    // при подтверждении контакта. Best-effort: токены уже выданы, отказ админ-API не должен
    // превращать успешный вход в ошибку — догоним на следующем входе.
    const profile = await this.loadProfile(claims.sub);

    const payload: {
      keycloakId: string;
      email: string | null;
      roles: string[];
      firstName?: string | null;
      lastName?: string | null;
    } = {
      keycloakId: claims.sub,
      email: claims.email,
      roles: claims.roles,
    };
    if (profile) {
      payload.firstName = profile.firstName;
      payload.lastName = profile.lastName;
    }

    // Cross-module coordination: User module will upsert local row.
    await this.eventBus.publish(new UserSignedInEvent(payload));

    return tokens;
  }

  private async loadProfile(
    keycloakId: string,
  ): Promise<{ firstName: string | null; lastName: string | null } | null> {
    try {
      const found = await this.identityAdmin.findById(keycloakId);
      if (!found) return null;
      return { firstName: found.firstName, lastName: found.lastName };
    } catch (err) {
      this.logger.warn(
        `profile lookup failed kc=${keycloakId.substring(0, 8)}...: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
