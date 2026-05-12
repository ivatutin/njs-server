import { Module } from '@nestjs/common';
import { IDENTITY_PROVIDER } from './domain/ports/identity-provider.port';
import { TOKEN_STORE } from './domain/ports/token-store.port';
import { KeycloakHttpClient } from './infrastructure/keycloak/keycloak-http.client';
import { KeycloakJwtVerifier } from './infrastructure/keycloak/keycloak-jwt.verifier';
import { KeycloakAdapter } from './infrastructure/keycloak/keycloak.adapter';
import { RedisTokenStore } from './infrastructure/redis/redis-token.store';
import { SignInUseCase } from './application/use-cases/sign-in/sign-in.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token/refresh-token.use-case';
import { SignOutUseCase } from './application/use-cases/sign-out/sign-out.use-case';
import { ValidateTokenUseCase } from './application/use-cases/validate-token/validate-token.use-case';
import { AuthController } from './interfaces/http/auth.controller';

@Module({
  controllers: [AuthController],
  providers: [
    // Adapters
    KeycloakHttpClient,
    KeycloakJwtVerifier,
    { provide: IDENTITY_PROVIDER, useClass: KeycloakAdapter },
    { provide: TOKEN_STORE, useClass: RedisTokenStore },

    // Use cases
    SignInUseCase,
    RefreshTokenUseCase,
    SignOutUseCase,
    ValidateTokenUseCase,
  ],
  // ValidateTokenUseCase will be consumed by JwtAuthGuard in part 15.4
  exports: [ValidateTokenUseCase],
})
export class AuthModule {}
