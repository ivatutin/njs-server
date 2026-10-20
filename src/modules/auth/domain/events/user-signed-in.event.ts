import { DomainEvent } from '@shared/domain/domain-event';

/**
 * Emitted by Auth module after a successful sign-in.
 * Consumed by User module (OnUserSignedInHandler) to upsert local user
 * record keyed by keycloakId. Modules don't import each other directly —
 * only through this event.
 */
export class UserSignedInEvent implements DomainEvent {
  readonly eventName = 'auth.user-signed-in';
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(data: {
    keycloakId: string;
    email: string | null;
    roles: string[];
    /**
     * Имя из Keycloak — источник истины по профилю (контракт v1.6).
     * `undefined` = «в событии имени нет» (не трогаем shadow), `null` = «в Keycloak пусто».
     */
    firstName?: string | null;
    lastName?: string | null;
  }) {
    this.occurredOn = new Date();
    this.payload = { ...data };
  }
}
