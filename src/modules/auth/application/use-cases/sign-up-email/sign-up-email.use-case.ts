import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { generateLoginHandle } from '@shared/domain/login-handle';
import {
  ProvisionedUser,
  USER_PROVISIONING,
  UserProvisioning,
} from '@shared/application/user-provisioning.interface';
import { TermsNotAcceptedError } from '../../../domain/errors/terms-not-accepted.error';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import { SignUpEmailCommand } from './sign-up-email.command';

export interface SignUpEmailResult {
  user: ProvisionedUser;
  verifyEmailSent: boolean;
}

/**
 * Email-регистрация (Phase 1).
 *
 * Порядок: проверка `acceptedTerms` → создание учётки в Keycloak с паролем и
 * required action `VERIFY_EMAIL` → создание shadow-пользователя в нашей БД
 * (через shared-порт `USER_PROVISIONING`) → отправка magic link.
 *
 * Ошибки Keycloak приходят уже доменными: `ContactAlreadyExistsError` (409)
 * и `PasswordPolicyViolationError` (422).
 */
@Injectable()
export class SignUpEmailUseCase implements UseCase<SignUpEmailCommand, SignUpEmailResult> {
  private readonly logger = new Logger(SignUpEmailUseCase.name);

  constructor(
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    @Inject(USER_PROVISIONING) private readonly users: UserProvisioning,
  ) {}

  async execute(cmd: SignUpEmailCommand): Promise<SignUpEmailResult> {
    if (cmd.acceptedTerms !== true) throw new TermsNotAcceptedError();

    // Путь B (ADR-0017 ред.2): логин в Keycloak — стабильный handle, email живёт отдельным атрибутом.
    const handle = generateLoginHandle();

    const created = await this.identityAdmin.createEmailUser({
      username: handle,
      email: cmd.email,
      password: cmd.password,
      firstName: cmd.firstName,
      lastName: cmd.lastName,
    });

    const user = await this.users.ensureFromIdentity({
      keycloakId: created.keycloakId,
      email: cmd.email,
      handle,
      firstName: cmd.firstName,
      lastName: cmd.lastName,
    });

    return { user, verifyEmailSent: await this.sendVerifyEmail(created.keycloakId) };
  }

  /**
   * Отправка письма не должна валить регистрацию: учётка и shadow-user уже
   * созданы, а повторную отправку закрывает `POST /auth/verify-email/resend`.
   */
  private async sendVerifyEmail(keycloakId: string): Promise<boolean> {
    try {
      await this.identityAdmin.sendVerifyEmail(keycloakId);
      return true;
    } catch (err) {
      this.logger.error(
        `verify email was not sent for kc=${keycloakId.substring(0, 8)}...: ${
          (err as Error).message
        }`,
      );
      return false;
    }
  }
}
