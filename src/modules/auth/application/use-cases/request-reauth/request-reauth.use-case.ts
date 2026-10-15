import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import {
  LOGIN_HANDLE_RESOLVER,
  LoginHandleResolver,
} from '@shared/application/login-handle.interface';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import {
  IDENTITY_PROVIDER,
  IdentityProviderPort,
} from '../../../domain/ports/identity-provider.port';
import {
  REAUTH_TOKEN_STORE,
  ReauthTokenStore,
} from '../../../domain/ports/reauth-token-store.port';
import { RequestReauthCommand } from './request-reauth.command';

export interface RequestReauthResult {
  reauthToken: string;
  /** ISO-строка: контракт отдаёт `expiresAt` строкой. */
  expiresAt: string;
}

/**
 * `POST /auth/reauth` (Phase 4): подтверждение пароля перед опасными
 * операциями (смена контактов/пароля).
 *
 * Пароль проверяем у Keycloak (тот же password grant, что в обычном входе), а
 * сессию, которую он создаёт, сразу гасим — нам нужен только факт «пароль
 * верный», а не ещё одна сессия пользователя. Логин (`username`) берём из
 * админ-API: у phone-пользователя его нет в токене (нет claim `email`).
 */
@Injectable()
export class RequestReauthUseCase implements UseCase<RequestReauthCommand, RequestReauthResult> {
  private readonly logger = new Logger(RequestReauthUseCase.name);

  constructor(
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProviderPort,
    @Inject(REAUTH_TOKEN_STORE) private readonly reauthTokens: ReauthTokenStore,
    @Inject(LOGIN_HANDLE_RESOLVER) private readonly handles: LoginHandleResolver,
  ) {}

  async execute(cmd: RequestReauthCommand): Promise<RequestReauthResult> {
    // Логин в Keycloak — handle (путь B); username из админ-API — фолбэк для строк, созданных до политики.
    const handle = await this.handles.byKeycloakId(cmd.keycloakId);
    const identity = handle ? null : await this.identityAdmin.findById(cmd.keycloakId);
    const login = handle ?? identity?.username ?? null;

    if (!login) {
      // Пользователя нет в Keycloak (или он без логина) — пароля у него тоже нет.
      this.logger.warn(`reauth requested for unknown kc=${cmd.keycloakId.substring(0, 8)}...`);
      throw new InvalidCredentialsError();
    }

    let tokens: { refreshToken: string };
    try {
      tokens = await this.idp.signIn(login, cmd.password);
    } catch (err) {
      this.logger.warn(
        `reauth failed for kc=${cmd.keycloakId.substring(0, 8)}...: ${(err as Error).message}`,
      );
      throw new InvalidCredentialsError();
    }

    // Пароль подтверждён — сессию Keycloak закрываем: reauth не является входом.
    await this.idp.signOut(tokens.refreshToken);

    const issued = await this.reauthTokens.issue({ keycloakId: cmd.keycloakId });
    return { reauthToken: issued.token, expiresAt: issued.expiresAt.toISOString() };
  }
}
