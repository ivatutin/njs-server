import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ContactAlreadyExistsError } from '@shared/domain/errors/contact-already-exists.error';
import { PasswordPolicyViolationError } from '../../domain/errors/password-policy-violation.error';
import {
  EmailVerificationEvent,
  IdentityAdminPort,
  IdentityAdminUser,
} from '../../domain/ports/identity-admin.port';
import { KeycloakAdminClient, KeycloakAdminUserRepresentation } from './keycloak-admin.client';

const VERIFY_EMAIL_EVENT = 'VERIFY_EMAIL';
const MAX_EVENTS_PER_POLL = 100;
/** Ссылка «сменить пароль» живёт 1 час (чек-лист Phase 1.5). */
const PASSWORD_RESET_LINK_TTL = 3600;

/**
 * Keycloak-backed реализация `IdentityAdminPort`.
 * Keycloak-специфика (URL, representations, errorMessage) не выходит за пределы
 * этого класса: наружу — доменные типы и доменные ошибки.
 */
@Injectable()
export class KeycloakAdminAdapter implements IdentityAdminPort {
  private readonly logger = new Logger(KeycloakAdminAdapter.name);

  constructor(private readonly client: KeycloakAdminClient) {}

  async createEmailUser(params: {
    email: string;
    password: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<{ keycloakId: string }> {
    try {
      const keycloakId = await this.client.createUser({
        username: params.email,
        email: params.email,
        emailVerified: false,
        enabled: true,
        requiredActions: ['VERIFY_EMAIL'],
        ...(params.firstName ? { firstName: params.firstName } : {}),
        ...(params.lastName ? { lastName: params.lastName } : {}),
        credentials: [{ type: 'password', value: params.password, temporary: false }],
      });

      if (keycloakId) return { keycloakId };

      // Location-заголовка может не быть (прокси) — доискиваемся по email
      const created = await this.findByEmail(params.email);
      if (!created) throw new Error('Keycloak user was created but cannot be located by email');
      return { keycloakId: created.keycloakId };
    } catch (err) {
      throw this.mapCreateUserError(err);
    }
  }

  async findByEmail(email: string): Promise<IdentityAdminUser | null> {
    const users = await this.client.findUsersByEmail(email);
    if (users.length === 0) return null;
    if (users.length > 1) {
      this.logger.warn(`Keycloak returned ${users.length} users for one email — берём первый`);
    }
    return this.toUser(users[0]);
  }

  async sendVerifyEmail(keycloakId: string): Promise<void> {
    await this.client.sendVerifyEmail(keycloakId);
  }

  async sendPasswordResetEmail(keycloakId: string): Promise<void> {
    await this.client.executeActionsEmail(keycloakId, ['UPDATE_PASSWORD'], PASSWORD_RESET_LINK_TTL);
  }

  async findEmailVerificationEvents(params: {
    sinceSeconds: number;
  }): Promise<EmailVerificationEvent[]> {
    // Keycloak принимает `dateFrom` только как `yyyy-MM-dd`, поэтому окно
    // получается суточным (с начала дня, покрывающего sinceSeconds). Повторное
    // чтение безопасно: listener дедуплицирует события, а обработчик в
    // user-модуле идемпотентен.
    const dateFrom = new Date(Date.now() - params.sinceSeconds * 1000).toISOString().slice(0, 10);
    const events = await this.client.findUserEvents({
      type: VERIFY_EMAIL_EVENT,
      dateFrom,
      max: MAX_EVENTS_PER_POLL,
    });

    return events.flatMap((event) => {
      if (!event.userId) return [];
      return [
        {
          keycloakId: event.userId,
          email: event.details?.email ?? null,
          time: event.time ?? 0,
        },
      ];
    });
  }

  private toUser(user: KeycloakAdminUserRepresentation): IdentityAdminUser {
    return {
      keycloakId: user.id,
      email: user.email ?? null,
      emailVerified: user.emailVerified === true,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    };
  }

  /**
   * Контракт различает два исхода создания учётки:
   * 409 → `ContactAlreadyExists`, 400 c `errorMessage` → `PasswordPolicyViolation`
   * (Keycloak отдаёт message-key вида `invalidPasswordMinLengthMessage`).
   */
  private mapCreateUserError(err: unknown): Error {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const message = this.extractErrorMessage(err.response?.data);
      if (status === 409) return new ContactAlreadyExistsError();
      if (status === 400 && message) return new PasswordPolicyViolationError(message);
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  private extractErrorMessage(data: unknown): string | null {
    if (typeof data === 'string' && data.length > 0) return data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const candidate = record.errorMessage ?? record.error_description ?? record.error;
      if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
    return null;
  }
}
