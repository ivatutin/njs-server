import { Injectable, Logger } from '@nestjs/common';
import {
  IdentityProviderPort,
  TokenClaims,
  TokenPair,
} from '../../domain/ports/identity-provider.port';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import { KeycloakHttpClient } from './keycloak-http.client';
import { KeycloakJwtVerifier } from './keycloak-jwt.verifier';

interface KeycloakJwtPayload {
  sub?: string;
  email?: string;
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

  constructor(
    private readonly http: KeycloakHttpClient,
    private readonly jwtVerifier: KeycloakJwtVerifier,
  ) {}

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
      if (!payload.sub || !payload.email) {
        throw new Error('JWT missing required claims (sub/email)');
      }
      return {
        sub: payload.sub,
        email: payload.email,
        roles: payload.realm_access?.roles ?? [],
      };
    } catch (err) {
      this.logger.debug(`verifyAccessToken failed: ${(err as Error).message}`);
      throw new InvalidTokenError();
    }
  }
}
