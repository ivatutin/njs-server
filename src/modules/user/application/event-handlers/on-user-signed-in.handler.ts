import { Inject, Injectable, Logger } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../domain/repositories/user.repository';

/**
 * Payload contract for the `auth.user-signed-in` event.
 * Defined locally to keep User module free of imports from Auth.
 * The shape is the public API of the event itself.
 *
 * `firstName`/`lastName` приходят из Keycloak (источник истины по имени, контракт v1.6).
 * `undefined` = «в событии имени нет» (shadow не трогаем), `null` = «в Keycloak пусто».
 */
export interface UserSignedInPayload {
  keycloakId: string;
  email: string;
  roles: string[];
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Cross-module handler. When Auth publishes user-signed-in (after a
 * successful sign-in through Keycloak), we ensure a corresponding local
 * User record exists and reflects current roles and name.
 *
 * First sign-in: create new User with the email already marked verified
 * (Keycloak has already verified it on its side) **and the name from Keycloak**.
 *
 * Subsequent sign-in: sync name and roles if changed. The name is owned by
 * Keycloak (contract v1.6) — this is what heals the shadow after a profile
 * update whose local write failed, and what keeps `PATCH /users/me/profile`
 * from being reverted on the next sign-in.
 *
 * Email drift is logged but not synced — a verified email change goes through
 * the contact-change flow (ADR-0017), not through this handler.
 */
@Injectable()
export class OnUserSignedInHandler {
  private readonly logger = new Logger(OnUserSignedInHandler.name);

  constructor(@Inject(USER_REPOSITORY) private readonly userRepo: UserRepository) {}

  async handle(event: { payload: UserSignedInPayload }): Promise<void> {
    const { keycloakId, email, roles, firstName, lastName } = event.payload;
    const kcShort = keycloakId.substring(0, 8);

    const existing = await this.userRepo.findByKeycloakId(keycloakId);

    if (!existing) {
      const user = User.create({ keycloakId, email, roles, firstName, lastName });
      user.verifyEmail();
      await this.userRepo.save(user);
      this.logger.log(`Created user from first sign-in: kc=${kcShort}...`);
      return;
    }

    const currentEmail = existing.email?.toString() ?? null;
    if (currentEmail !== email) {
      this.logger.warn(
        `Keycloak email changed (kc=${kcShort}...): "${currentEmail}" -> "${email}". ` +
          `Email drift is not synced here: a verified email change goes through contact-change (ADR-0017).`,
      );
    }

    // Имя: источник истины — Keycloak. Синхронизируем только явно переданные поля:
    // undefined = «в событии имени нет», null = «в Keycloak пусто» (чистим).
    const nameChanges: { firstName?: string | null; lastName?: string | null } = {};
    if (firstName !== undefined && firstName !== existing.firstName) {
      nameChanges.firstName = firstName;
    }
    if (lastName !== undefined && lastName !== existing.lastName) {
      nameChanges.lastName = lastName;
    }
    const nameChanged = Object.keys(nameChanges).length > 0;

    const currentRoles = [...existing.roles].sort();
    const incomingRoles = [...roles].sort();
    const rolesChanged =
      currentRoles.length !== incomingRoles.length ||
      currentRoles.some((r, i) => r !== incomingRoles[i]);

    if (!nameChanged && !rolesChanged) return;

    if (nameChanged) existing.updateProfile(nameChanges);
    if (rolesChanged) existing.updateRoles(roles);

    await this.userRepo.save(existing);
    if (nameChanged) {
      this.logger.log(`Synced name for kc=${kcShort}...: [${Object.keys(nameChanges).join(',')}]`);
    }
    if (rolesChanged) {
      this.logger.log(`Synced roles for kc=${kcShort}...: [${roles.join(',')}]`);
    }
  }
}
