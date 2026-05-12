import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { TestModule } from '@modules/_test';
import { DevModule } from '@modules/_dev';
import { EventBusModule } from './shared/infrastructure/event-bus/event-bus.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { RedisModule } from './shared/infrastructure/redis/redis.module';
import { HealthModule } from './shared/infrastructure/health/health.module';
import { AppLoggerModule } from './shared/infrastructure/logger/logger.module';
import { AllExceptionsFilter } from './shared/infrastructure/filters/all-exceptions.filter';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { validate } from './config/env.validation';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import keycloakConfig from './config/keycloak.config';

@Module({
  controllers: [AppController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [appConfig, databaseConfig, redisConfig, keycloakConfig],
    }),
    AppLoggerModule,
    PrismaModule,
    RedisModule,
    EventBusModule,
    HealthModule,
    UserModule,
    AuthModule,
    TestModule,
    DevModule,
  ],
})
export class AppModule {}
