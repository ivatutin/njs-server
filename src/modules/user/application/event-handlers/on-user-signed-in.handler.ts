import { Inject, Injectable, Logger } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../domain/repositories/user.repository';

/**
 * Payload contract for the `auth.user-signed-in` event.
 * Defined locally to keep User module free of imports from Auth.
 * The shape is the public API of the event itself.
 */
export interface UserSignedInPayload {
  keycloakId: string;
  email: string;
  roles: string[];
}

/**
 * Cross-module handler. When Auth publishes user-signed-in (after a
 * successful sign-in through Keycloak), we ensure a corresponding local
 * User record exists and reflects current roles.
 *
 * First sign-in: create new User with the email already marked verified
 * (Keycloak has already verified it on its side).
 *
 * Subsequent sign-in: sync roles if changed. Email drift is logged but
 * not synced — direct email change for verified accounts requires a
 * separate flow (PendingEmailChange) that will be implemented later.
 */
@Injectable()
export class OnUserSignedInHandler {
  private readonly logger = new Logger(OnUserSignedInHandler.name);

  constructor(@Inject(USER_REPOSITORY) private readonly userRepo: UserRepository) {}

  async handle(event: { payload: UserSignedInPayload }): Promise<void> {
    const { keycloakId, email, roles } = event.payload;
    const kcShort = keycloakId.substring(0, 8);

    const existing = await this.userRepo.findByKeycloakId(keycloakId);

    if (!existing) {
      const user = User.create({ keycloakId, email, roles });
      user.verifyEmail();
      await this.userRepo.save(user);
      this.logger.log(`Created user from first sign-in: kc=${kcShort}...`);
      return;
    }

    const currentEmail = existing.email?.toString() ?? null;
    if (currentEmail !== email) {
      this.logger.warn(
        `Keycloak email changed (kc=${kcShort}...): "${currentEmail}" -> "${email}". ` +
          `Profile sync for verified contact not implemented.`,
      );
    }

    const currentRoles = [...existing.roles].sort();
    const incomingRoles = [...roles].sort();
    const rolesChanged =
      currentRoles.length !== incomingRoles.length ||
      currentRoles.some((r, i) => r !== incomingRoles[i]);

    if (rolesChanged) {
      existing.updateRoles(roles);
      await this.userRepo.save(existing);
      this.logger.log(`Synced roles for kc=${kcShort}...: [${roles.join(',')}]`);
    }
  }
}
