import { Injectable, Logger } from '@nestjs/common';
import { UserNotFoundError } from '@shared/domain/errors/user-not-found.error';
import { KeycloakAdminClient } from '@shared/infrastructure/keycloak/keycloak-admin.client';
import { IdentityProfileUnavailableError } from '../../domain/errors/identity-profile-unavailable.error';
import { IdentityProfilePort } from '../../domain/ports/identity-profile.port';

/**
 * Запись имени в Keycloak (Admin API, `PUT /users/{id}`).
 *
 * `PUT` — **полная замена** представления: всё, чего нет в теле, затирается. На живой
 * приёмке это однажды снесло `email`, `firstName` и `lastName` (см. `KeycloakAdminAdapter.updateContacts`).
 * Поэтому читаем текущее представление и переносим его целиком — вместе с `username`,
 * атрибутами и `requiredActions`, — меняя только имя.
 */
@Injectable()
export class KeycloakIdentityProfileAdapter implements IdentityProfilePort {
  private readonly logger = new Logger(KeycloakIdentityProfileAdapter.name);

  constructor(private readonly client: KeycloakAdminClient) {}

  async updateName(params: {
    keycloakId: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<void> {
    const kcShort = params.keycloakId.substring(0, 8);

    let current: Awaited<ReturnType<KeycloakAdminClient['findUserById']>>;
    try {
      current = await this.client.findUserById(params.keycloakId);
    } catch (err) {
      this.logger.warn(`profile update: keycloak read failed kc=${kcShort}...: ${message(err)}`);
      throw new IdentityProfileUnavailableError();
    }

    if (!current) {
      throw new UserNotFoundError(`keycloakId=${params.keycloakId}`);
    }

    const representation: Record<string, unknown> = {
      ...current,
      firstName: params.firstName !== undefined ? params.firstName : (current.firstName ?? null),
      lastName: params.lastName !== undefined ? params.lastName : (current.lastName ?? null),
    };

    try {
      await this.client.updateUser(params.keycloakId, representation);
    } catch (err) {
      this.logger.warn(`profile update: keycloak write failed kc=${kcShort}...: ${message(err)}`);
      throw new IdentityProfileUnavailableError();
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
