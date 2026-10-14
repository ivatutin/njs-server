import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import {
  PASSWORD_RESET_RATE_LIMITER,
  PasswordResetRateLimiter,
} from '../../../domain/ports/password-reset-rate-limiter.port';
import { ForgotPasswordCommand } from './forgot-password.command';

/**
 * «Забыл пароль» (Phase 1.5).
 *
 * Keycloak сам делает всю работу: отправляет письмо с required action
 * `UPDATE_PASSWORD` (ссылка живёт 1 час) и валидирует новый пароль по политике.
 *
 * Эндпоинт **всегда** отвечает 202 (anti-enumeration), поэтому все исходы —
 * «нет такого адреса», «превышен лимит», «Keycloak/SMTP недоступны» — гасятся
 * в лог, а наружу ничего не различается.
 */
@Injectable()
export class ForgotPasswordUseCase implements UseCase<ForgotPasswordCommand, void> {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    @Inject(PASSWORD_RESET_RATE_LIMITER) private readonly rateLimiter: PasswordResetRateLimiter,
  ) {}

  async execute(cmd: ForgotPasswordCommand): Promise<void> {
    try {
      const decision = await this.rateLimiter.consume(cmd.email);
      if (!decision.allowed) {
        this.logger.warn(
          `forgot-password: rate limited, letter skipped (retry in ~${decision.retryAfterSeconds}s)`,
        );
        return;
      }

      const user = await this.identityAdmin.findByEmail(cmd.email);
      if (!user) {
        this.logger.log('forgot-password: no such user (202 anyway)');
        return;
      }

      await this.identityAdmin.sendPasswordResetEmail(user.keycloakId);
      this.logger.log('forgot-password: reset letter queued');
    } catch (err) {
      this.logger.warn(`forgot-password failed silently: ${(err as Error).message}`);
    }
  }
}
