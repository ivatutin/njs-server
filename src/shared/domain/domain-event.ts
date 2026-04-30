export interface DomainEvent {
  readonly eventName: string;
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;
}
