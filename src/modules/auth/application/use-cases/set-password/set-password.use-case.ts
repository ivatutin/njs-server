import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import {
  VERIFICATION_TOKEN_CONSUMER,
  VerificationTokenConsumer,
} from '@shared/application/verification-token-consumer.interface';
import { VerificationTokenExpiredError } from '@shared/domain/errors/verification-token-expired.error';
import { VerificationTokenInvalidError } from '@shared/domain/errors/verification-token-invalid.error';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import { RevokeUserAccessCommand } from '../revoke-user-access/revoke-user-access.command';
import { RevokeUserAccessUseCase } from '../revoke-user-access/revoke-user-access.use-case';
import { SetPasswordCommand } from './set-password.command';

/**
 * `POST /users/me/set-password` (Phase 4): пользователь без пароля (phone-регистрация
 * по ADR-0015) заводит себе пароль, подтвердив владение контактом.
 *
 * Токен должен быть с `purpose='set-password'` **и принадлежать контакту текущего
 * пользователя**: иначе владелец валидного токена на свой номер мог бы задать
 * пароль чужому аккаунту. Пароль пишем в Keycloak (admin API), политику
 * проверяет он же — нарушение приходит как `PasswordPolicyViolation` (422).
 */
@Injectable()
export class SetPasswordUseCase implements UseCase<SetPasswordCommand, void> {
  private readonly logger = new Logger(SetPasswordUseCase.name);

  constructor(
    @Inject(VERIFICATION_TOKEN_CONSUMER)
    private readonly verification: VerificationTokenConsumer,
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    private readonly revoke: RevokeUserAccessUseCase,
  ) {}

  async execute(cmd: SetPasswordCommand): Promise<void> {
    const proof = await this.verification.consume(cmd.verificationToken);
    if (!proof) throw new VerificationTokenExpiredError();
    if (proof.purpose !== 'set-password') throw new VerificationTokenInvalidError();

    const identity = await this.identityAdmin.findById(cmd.keycloakId);
    if (!identity) {
      this.logger.warn(`set-password for unknown kc=${cmd.keycloakId.substring(0, 8)}...`);
      throw new VerificationTokenInvalidError();
    }

    const ownsContact =
      proof.target === identity.phone ||
      (identity.email !== null && proof.target === identity.email);
    if (!ownsContact) {
      this.logger.warn(
        `set-password: verificationToken target does not belong to kc=${cmd.keycloakId.substring(0, 8)}...`,
      );
      throw new VerificationTokenInvalidError();
    }

    // Отзыв — ДО коммита (ADR-0018): пароль установлен, старый доступ уже мёртв.
    await this.revoke.execute(new RevokeUserAccessCommand(cmd.keycloakId, 'password-change'));

    await this.identityAdmin.setPassword({
      keycloakId: cmd.keycloakId,
      password: cmd.newPassword,
    });
  }
}
