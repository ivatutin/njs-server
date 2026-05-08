import { DomainEvent } from '@shared/domain/domain-event';

export class PhoneVerifiedEvent implements DomainEvent {
  readonly eventName = 'user.phone-verified';
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;

  constructor(data: { userId: string; phone: string }) {
    this.occurredOn = new Date();
    this.payload = { ...data };
  }
}
