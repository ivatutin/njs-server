import { Global, Module } from '@nestjs/common';
import { EVENT_BUS } from '../../application/event-bus.interface';
import { InMemoryEventBus } from './in-memory-event-bus';

@Global()
@Module({
  providers: [
    {
      provide: EVENT_BUS,
      useClass: InMemoryEventBus,
    },
  ],
  exports: [EVENT_BUS],
})
export class EventBusModule {}
