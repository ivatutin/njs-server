import { DomainEvent } from '@shared/domain/domain-event';

/**
 * Emitted by Auth module when Keycloak reports a VERIFY_EMAIL event
 * (the user clicked the magic link). Consumed by User module
 * (OnEmailVerifiedHandler) to mark the local shadow user verified.
 *
 * Keycloak не умеет отдавать события наружу без Java-SPI, поэтому auth-модуль
 * поллит Admin Events API и публикует это событие (см. ADR-0012).
 */
export class EmailVerifiedEvent implements DomainEvent {
  readonly eventName = 'auth.email-verified';
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(data: { keycloakId: string; email: string | null }) {
    this.occurredOn = new Date();
    this.payload = { ...data };
  }
}
