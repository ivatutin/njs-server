import { DomainEvent } from '../domain/domain-event';

export const EVENT_BUS = Symbol('EVENT_BUS');

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
  subscribe(eventName: string, handler: EventHandler): void;
}
