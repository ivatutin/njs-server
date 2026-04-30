import { DomainEvent } from '@shared/domain/domain-event';

export class UserUpdatedEvent implements DomainEvent {
  readonly eventName = 'user.updated';
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(data: { userId: string; changes: string[] }) {
    this.occurredOn = new Date();
    this.payload = { ...data };
  }
}
