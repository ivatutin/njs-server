import { Injectable, Logger } from '@nestjs/common';
import { EventBus, EventHandler } from '../../application/event-bus.interface';
import { DomainEvent } from '../../domain/domain-event';

@Injectable()
export class InMemoryEventBus implements EventBus {
  private readonly logger = new Logger(InMemoryEventBus.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe(eventName: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventName) || [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
    this.logger.log(`Subscribed to "${eventName}"`);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventName) || [];
    this.logger.debug(`Publishing "${event.eventName}" to ${handlers.length} handler(s)`);

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(`Handler failed for "${event.eventName}": ${error}`);
      }
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
