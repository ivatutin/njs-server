import { DomainEvent } from '@shared/domain/domain-event';

export class UserCreatedEvent implements DomainEvent {
  readonly eventName = 'user.created';
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(data: { userId: string; email: string | null; keycloakId: string }) {
    this.occurredOn = new Date();
    this.payload = { ...data };
  }
}
