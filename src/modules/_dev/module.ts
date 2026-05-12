import { Module } from '@nestjs/common';
import { DevController } from './controller';
import { DevService } from './service';

@Module({
  controllers: [DevController],
  providers: [DevService],
  exports: [DevService], // ??? Позволяет другим модулям использовать этот сервис
})
export class DevModule {}
