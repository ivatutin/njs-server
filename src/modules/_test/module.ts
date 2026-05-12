import { Module } from '@nestjs/common';
import { TestController } from './controller';
import { TestService } from './service';
import { DevModule } from '@modules/_dev';

@Module({
  controllers: [TestController],
  providers: [TestService],
  exports: [TestService], // ??? Позволяет другим модулям использовать этот сервис
  imports: [DevModule],
})
export class TestModule {}
