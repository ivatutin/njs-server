import { Global, Module } from '@nestjs/common';
import { KeycloakAdminClient } from './keycloak-admin.client';

/**
 * Общий Keycloak Admin-клиент (client_credentials + REST).
 *
 * Почему @Global и shared: клиент нужен **двум** контекстам — auth (контакты, пароли,
 * события Keycloak) и user (self-service профиль, `PATCH /users/me/profile`).
 * Правила проекта запрещают импорт «модуль → модуль», поэтому инфраструктура,
 * общая для контекстов, живёт в shared, как Redis/Prisma/EventBus.
 */
@Global()
@Module({
  providers: [KeycloakAdminClient],
  exports: [KeycloakAdminClient],
})
export class KeycloakAdminModule {}
