import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UseCase } from '@shared/application/use-case.interface';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import { TOKEN_STORE, TokenStorePort } from '../../../domain/ports/token-store.port';
import { RevokeUserAccessCommand } from './revoke-user-access.command';

/** Запас к TTL метки (ADR-0018, C4): покрывает расхождение часов и запросы «в полёте». */
const REVOCATION_TTL_MARGIN_SECONDS = 60;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 300;

/**
 * **Единственная точка отзыва доступа** (ADR-0018). Две операции, которые нельзя разделять:
 *
 * 1. Keycloak — погасить **все** сессии: иначе `POST /auth/refresh` выдаст новый токен с `iat > revokedAt`
 *    и обойдёт метку;
 * 2. Redis — метка `auth:sub-revoked:<sub>`: иначе уже выданный access-токен живёт до `exp`.
 *
 * Порядок именно такой — сначала то, что **нельзя обойти**. Шаг 1 **не best-effort**: любая ошибка (KC или Redis)
 * → `503`, и метка не выставляется. Тихий полу-отзыв опаснее честного отказа.
 *
 * Вызывается потребителями **до** применения изменения: смена контакта (ADR-0017), смена/установка пароля,
 * админские suspend/delete, будущее «выйти везде». В `sign-out` **не** вызывается — там остаётся пер-токенный блоклист,
 * иначе выход на одном устройстве убивал бы все.
 */
@Injectable()
export class RevokeUserAccessUseCase implements UseCase<RevokeUserAccessCommand, void> {
  private readonly logger = new Logger(RevokeUserAccessUseCase.name);
  private readonly accessTokenTtlSeconds: number;

  constructor(
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    @Inject(TOKEN_STORE) private readonly tokenStore: TokenStorePort,
    config: ConfigService,
  ) {
    const configured = Number(config.get('ACCESS_TOKEN_TTL_SECONDS'));
    this.accessTokenTtlSeconds =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  }

  async execute(cmd: RevokeUserAccessCommand): Promise<void> {
    const kcShort = cmd.keycloakId.substring(0, 8);

    try {
      await this.identityAdmin.logoutAllSessions(cmd.keycloakId);
    } catch (err) {
      this.logger.error(
        `revoke (${cmd.reason}) failed at Keycloak logout for kc=${kcShort}...: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Access revocation failed');
    }

    try {
      await this.tokenStore.revokeUserTokens(
        cmd.keycloakId,
        this.accessTokenTtlSeconds + REVOCATION_TTL_MARGIN_SECONDS,
      );
    } catch (err) {
      this.logger.error(
        `revoke (${cmd.reason}) failed at Redis marker for kc=${kcShort}...: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Access revocation failed');
    }

    this.logger.log(`access revoked (${cmd.reason}) for kc=${kcShort}...`);
  }
}
