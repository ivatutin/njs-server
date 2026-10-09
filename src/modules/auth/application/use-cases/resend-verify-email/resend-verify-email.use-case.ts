import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import { ResendVerifyEmailCommand } from './resend-verify-email.command';

/**
 * Повторная отправка письма-подтверждения (Phase 1).
 *
 * Anti-enumeration (контракт): наружу всегда `202`, поэтому метод ничего не
 * бросает и не сообщает, существует ли такая почта: все исходы (нет пользователя,
 * уже подтверждён, Keycloak/SMTP недоступны) гасятся в лог.
 */
@Injectable()
export class ResendVerifyEmailUseCase implements UseCase<ResendVerifyEmailCommand, void> {
  private readonly logger = new Logger(ResendVerifyEmailUseCase.name);

  constructor(@Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort) {}

  async execute(cmd: ResendVerifyEmailCommand): Promise<void> {
    try {
      const user = await this.identityAdmin.findByEmail(cmd.email);
      if (!user) {
        this.logger.log('verify-email resend: no such user (202 anyway)');
        return;
      }
      if (user.emailVerified) {
        this.logger.log('verify-email resend: already verified (202 anyway)');
        return;
      }
      await this.identityAdmin.sendVerifyEmail(user.keycloakId);
      this.logger.log('verify-email resend: message queued');
    } catch (err) {
      this.logger.warn(`verify-email resend failed silently: ${(err as Error).message}`);
    }
  }
}
