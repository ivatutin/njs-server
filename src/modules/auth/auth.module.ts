import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IDENTITY_PROVIDER } from './domain/ports/identity-provider.port';
import { IDENTITY_ADMIN } from './domain/ports/identity-admin.port';
import { PASSWORD_RESET_RATE_LIMITER } from './domain/ports/password-reset-rate-limiter.port';
import { TOKEN_STORE } from './domain/ports/token-store.port';
import { USER_TOKEN_ISSUER } from './domain/ports/user-token-issuer.port';
import { PENDING_MINT_STORE } from './domain/ports/pending-mint-store.port';
import { REAUTH_TOKEN_STORE } from './domain/ports/reauth-token-store.port';
import { RedisReauthTokenStore } from './infrastructure/redis/redis-reauth-token.store';
import { RequestReauthUseCase } from './application/use-cases/request-reauth/request-reauth.use-case';
import { UserTokenMintService } from './application/services/user-token-mint.service';
import { KeycloakCibaAdapter } from './infrastructure/keycloak/keycloak-ciba.adapter';
import { RedisPendingMintStore } from './infrastructure/redis/redis-pending-mint.store';
import { SignUpPhoneUseCase } from './application/use-cases/sign-up-phone/sign-up-phone.use-case';
import { SignInPhoneUseCase } from './application/use-cases/sign-in-phone/sign-in-phone.use-case';
import { HandleCibaChannelRequestUseCase } from './application/use-cases/handle-ciba-channel-request/handle-ciba-channel-request.use-case';
import { CibaChannelController } from './interfaces/http/ciba-channel.controller';
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
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password/forgot-password.use-case';
import { RedisPasswordResetRateLimiter } from './infrastructure/rate-limit/redis-password-reset.rate-limiter';
import { AuthController } from './interfaces/http/auth.controller';
import { JwtAuthGuard } from './interfaces/http/guards/jwt-auth.guard';
import { RolesGuard } from './interfaces/http/guards/roles.guard';

@Module({
  controllers: [AuthController, CibaChannelController],
  providers: [
    // Adapters
    KeycloakHttpClient,
    KeycloakJwtVerifier,
    KeycloakAdminClient,
    { provide: IDENTITY_PROVIDER, useClass: KeycloakAdapter },
    { provide: IDENTITY_ADMIN, useClass: KeycloakAdminAdapter },
    { provide: TOKEN_STORE, useClass: RedisTokenStore },
    // Выдача токенов пользователю без пароля (CIBA, ADR-0015)
    { provide: USER_TOKEN_ISSUER, useClass: KeycloakCibaAdapter },
    { provide: PENDING_MINT_STORE, useClass: RedisPendingMintStore },
    UserTokenMintService,
    // Reauth-токены для опасных операций (Phase 4)
    { provide: REAUTH_TOKEN_STORE, useClass: RedisReauthTokenStore },

    // Use cases
    SignInUseCase,
    RefreshTokenUseCase,
    SignOutUseCase,
    ValidateTokenUseCase,
    SignUpEmailUseCase,
    ResendVerifyEmailUseCase,
    ForgotPasswordUseCase,
    SignUpPhoneUseCase,
    SignInPhoneUseCase,
    HandleCibaChannelRequestUseCase,
    RequestReauthUseCase,

    // Инфраструктура
    { provide: PASSWORD_RESET_RATE_LIMITER, useClass: RedisPasswordResetRateLimiter },

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
