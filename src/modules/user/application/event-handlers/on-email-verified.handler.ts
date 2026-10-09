import { Inject, Injectable, Logger } from '@nestjs/common';
import { USER_REPOSITORY, UserRepository } from '../../domain/repositories/user.repository';

/**
 * Payload contract для `auth.email-verified`.
 * Определён локально, чтобы user-модуль не импортировал auth-модуль:
 * контракт события — это его публичный API.
 */
export interface EmailVerifiedPayload {
  keycloakId: string;
  email: string | null;
}

/**
 * Cross-module handler: пользователь подтвердил email в Keycloak (кликнул magic
 * link), auth-модуль заметил это через Admin Events API и опубликовал событие.
 * Здесь доводим shadow-пользователя до консистентного состояния:
 * `emailVerified = true` и (для pending) `status = active`.
 *
 * Идемпотентен: поллинг может перечитать то же событие, а `verifyEmail()`
 * повторный вызов игнорирует.
 */
@Injectable()
export class OnEmailVerifiedHandler {
  private readonly logger = new Logger(OnEmailVerifiedHandler.name);

  constructor(@Inject(USER_REPOSITORY) private readonly userRepo: UserRepository) {}

  async handle(event: { payload: EmailVerifiedPayload }): Promise<void> {
    const { keycloakId } = event.payload;
    const keycloakShort = keycloakId.substring(0, 8);

    const user = await this.userRepo.findByKeycloakId(keycloakId);
    if (!user) {
      this.logger.warn(
        `Email verified in Keycloak, но локального пользователя нет (kc=${keycloakShort}...): ` +
          `будет создан при первом sign-in`,
      );
      return;
    }

    if (user.isEmailVerified()) return;

    user.verifyEmail();
    await this.userRepo.save(user);
    this.logger.log(
      `Email verified: local user is now "${user.status.getValue()}" (kc=${keycloakShort}...)`,
    );
  }
}
