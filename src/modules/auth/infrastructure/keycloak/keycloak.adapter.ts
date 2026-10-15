import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IdentityProviderPort,
  TokenClaims,
  TokenPair,
} from '../../domain/ports/identity-provider.port';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import { KeycloakHttpClient } from './keycloak-http.client';
import { KeycloakJwtVerifier } from './keycloak-jwt.verifier';
import { filterBuiltinRealmRoles } from './realm-roles';

interface KeycloakJwtPayload {
  sub?: string;
  email?: string;
  azp?: string;
  iat?: number;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}

/**
 * Keycloak-backed implementation of IdentityProviderPort.
 * Translates raw Keycloak responses into domain types and Keycloak
 * errors into domain exceptions (InvalidCredentialsError / InvalidTokenError).
 * No Keycloak-specific types leak past this class.
 */
@Injectable()
export class KeycloakAdapter implements IdentityProviderPort {
  private readonly logger = new Logger(KeycloakAdapter.name);
  private readonly clientId: string;

  constructor(
    private readonly http: KeycloakHttpClient,
    private readonly jwtVerifier: KeycloakJwtVerifier,
    config: ConfigService,
  ) {
    this.clientId = config.get<string>('keycloak.clientId')!;
  }

  async signIn(email: string, password: string): Promise<TokenPair> {
    try {
      const data = await this.http.passwordGrant(email, password);
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    } catch (err) {
      this.logger.debug(`signIn failed for ${email}: ${(err as Error).message}`);
      throw new InvalidCredentialsError();
    }
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const data = await this.http.refreshGrant(refreshToken);
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };
    } catch (err) {
      this.logger.debug(`refresh failed: ${(err as Error).message}`);
      throw new InvalidTokenError('Invalid refresh token');
    }
  }

  async signOut(refreshToken: string): Promise<void> {
    try {
      await this.http.logout(refreshToken);
    } catch (err) {
      // Idempotent: an already-revoked token is fine.
      this.logger.debug(`signOut soft-fail: ${(err as Error).message}`);
    }
  }

  async verifyAccessToken(token: string): Promise<TokenClaims> {
    try {
      const payload = (await this.jwtVerifier.verify(token)) as KeycloakJwtPayload;
      if (!payload.sub) {
        throw new Error('JWT missing required claim (sub)');
      }
      // Defense in depth (ADR-0018): принимаем только токены нашего клиента, иначе токен Account Console тоже прошёл бы.
      if (payload.azp !== this.clientId) {
        throw new Error(`unexpected azp: ${String(payload.azp)}`);
      }
      // `iat` нужен для отзыва доступа (ADR-0018): его отсутствие — fail-closed.
      if (typeof payload.iat !== 'number') {
        throw new Error('JWT missing required claim (iat)');
      }
      return {
        sub: payload.sub,
        // Phone-пользователь (Phase 2) существует без email — это не ошибка.
        email: payload.email ?? null,
        // Встроенные роли Keycloak (offline_access, uma_authorization, default-roles-<realm>)
        // в claims не пускаем: это не наши роли (ADR-0020).
        roles: filterBuiltinRealmRoles(payload.realm_access?.roles ?? []),
        issuedAt: payload.iat,
      };
    } catch (err) {
      this.logger.debug(`verifyAccessToken failed: ${(err as Error).message}`);
      throw new InvalidTokenError();
    }
  }
}
