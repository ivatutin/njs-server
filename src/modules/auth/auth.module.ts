import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IDENTITY_PROVIDER } from './domain/ports/identity-provider.port';
import { IDENTITY_ADMIN } from './domain/ports/identity-admin.port';
import { TOKEN_STORE } from './domain/ports/token-store.port';
import { KeycloakHttpClient } from './infrastructure/keycloak/keycloak-http.client';
import { KeycloakJwtVerifier } from './infrastructure/keycloak/keycloak-jwt.verifier';
import { KeycloakAdapter } from './infrastructure/keycloak/keycloak.adapter';
import { KeycloakAdminClient } from './infrastructure/keycloak/keycloak-admin.client';
import { KeycloakAdminAdapter } from './infrastructure/keycloak/keycloak-admin.adapter';
import { KeycloakEventListenerService } from './infrastructure/keycloak/keycloak-event-listener.service';
import { RedisTokenStore } from './infrastructure/redis/redis-token.store';
import { SignInUseCase } from './application/use-cases/sign-in/sign-in.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token/refresh-token.use-case';
import { SignOutUseCase } from './application/use-cases/sign-out/sign-out.use-case';
import { ValidateTokenUseCase } from './application/use-cases/validate-token/validate-token.use-case';
import { SignUpEmailUseCase } from './application/use-cases/sign-up-email/sign-up-email.use-case';
import { ResendVerifyEmailUseCase } from './application/use-cases/resend-verify-email/resend-verify-email.use-case';
import { AuthController } from './interfaces/http/auth.controller';
import { JwtAuthGuard } from './interfaces/http/guards/jwt-auth.guard';
import { RolesGuard } from './interfaces/http/guards/roles.guard';

@Module({
  controllers: [AuthController],
  providers: [
    // Adapters
    KeycloakHttpClient,
    KeycloakJwtVerifier,
    KeycloakAdminClient,
    { provide: IDENTITY_PROVIDER, useClass: KeycloakAdapter },
    { provide: IDENTITY_ADMIN, useClass: KeycloakAdminAdapter },
    { provide: TOKEN_STORE, useClass: RedisTokenStore },

    // Use cases
    SignInUseCase,
    RefreshTokenUseCase,
    SignOutUseCase,
    ValidateTokenUseCase,
    SignUpEmailUseCase,
    ResendVerifyEmailUseCase,

    // «Слушатель» событий Keycloak (поллинг Admin Events API → domain event)
    KeycloakEventListenerService,

    // Global guards (order matters: JWT first, Roles after)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // ValidateTokenUseCase will be consumed by JwtAuthGuard in part 15.4
  exports: [ValidateTokenUseCase],
})
export class AuthModule {}
