import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { TestModule } from '@modules/_test';
import { DevModule } from '@modules/_dev';
import { EventBusModule } from './shared/infrastructure/event-bus/event-bus.module';
import { validate } from './config/env.validation';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import keycloakConfig from './config/keycloak.config';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [appConfig, databaseConfig, redisConfig, keycloakConfig],
    }),
    TestModule,
    DevModule,
    EventBusModule,
  ],
})
export class AppModule {}
