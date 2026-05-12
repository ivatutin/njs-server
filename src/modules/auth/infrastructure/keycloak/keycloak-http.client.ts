import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * Thin wrapper over Keycloak's OpenID Connect endpoints. Exposes only what
 * KeycloakAdapter needs; keeps axios out of the adapter and verifier files.
 */
@Injectable()
export class KeycloakHttpClient {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('keycloak.url')!;
    this.realm = config.get<string>('keycloak.realm')!;
    this.clientId = config.get<string>('keycloak.clientId')!;
    this.clientSecret = config.get<string>('keycloak.clientSecret')!;
  }

  /** URL of the JWKS endpoint — public keys for verifying access tokens. */
  get certsUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/certs`;
  }

  /** Issuer URL — must match the `iss` claim inside Keycloak-issued JWTs. */
  get issuerUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}`;
  }

  private get tokenUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
  }

  private get logoutUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/logout`;
  }

  async passwordGrant(email: string, password: string): Promise<KeycloakTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      username: email,
      password,
      scope: 'openid',
    });
    const { data } = await axios.post<KeycloakTokenResponse>(this.tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data;
  }

  async refreshGrant(refreshToken: string): Promise<KeycloakTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });
    const { data } = await axios.post<KeycloakTokenResponse>(this.tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data;
  }

  async logout(refreshToken: string): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });
    await axios.post(this.logoutUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }
}
