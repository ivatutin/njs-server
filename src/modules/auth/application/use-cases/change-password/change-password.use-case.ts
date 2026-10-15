import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import { RevokeUserAccessCommand } from '../revoke-user-access/revoke-user-access.command';
import { RevokeUserAccessUseCase } from '../revoke-user-access/revoke-user-access.use-case';
import { ChangePasswordCommand } from './change-password.command';

/**
 * `POST /users/me/password` (Phase 4): смена пароля при живой сессии.
 *
 * Требование «пароль введён недавно» проверяет `ReauthTokenGuard` (одноразовый
 * `X-Reauth-Token` того же пользователя), поэтому здесь остаётся только запись
 * пароля в Keycloak. Политику проверяет Keycloak → `PasswordPolicyViolation` (422).
 *
 * Пользователям без пароля (phone-регистрация) этот путь недоступен — им нужен
 * `POST /users/me/set-password` с `verificationToken`.
 */
@Injectable()
export class ChangePasswordUseCase implements UseCase<ChangePasswordCommand, void> {
  constructor(
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    private readonly revoke: RevokeUserAccessUseCase,
  ) {}

  async execute(cmd: ChangePasswordCommand): Promise<void> {
    // Отзыв — ДО коммита (ADR-0018): состояние «пароль изменён, доступ не отозван» недостижимо по построению.
    await this.revoke.execute(new RevokeUserAccessCommand(cmd.keycloakId, 'password-change'));

    await this.identityAdmin.setPassword({
      keycloakId: cmd.keycloakId,
      password: cmd.newPassword,
    });
  }
}
