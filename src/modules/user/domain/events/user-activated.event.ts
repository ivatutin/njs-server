import { DomainEvent } from '@shared/domain/domain-event';

export class UserActivatedEvent implements DomainEvent {
  readonly eventName = 'user.activated';
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(data: { userId: string }) {
    this.occurredOn = new Date();
    this.payload = { ...data };
  }
}
