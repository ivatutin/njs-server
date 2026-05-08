import { DomainEvent } from '@shared/domain/domain-event';

export class EmailVerifiedEvent implements DomainEvent {
  readonly eventName = 'user.email-verified';
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(data: { userId: string; email: string }) {
    this.occurredOn = new Date();
    this.payload = { ...data };
  }
}
