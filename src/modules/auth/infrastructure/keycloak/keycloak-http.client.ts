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
  private readonly issuer: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('keycloak.url')!;
    this.realm = config.get<string>('keycloak.realm')!;
    this.clientId = config.get<string>('keycloak.clientId')!;
    this.clientSecret = config.get<string>('keycloak.clientSecret')!;
    this.issuer = config.get<string>('keycloak.issuer')!;
  }

  /** URL of the JWKS endpoint — public keys for verifying access tokens. */
  get certsUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/certs`;
  }

  /**
   * Issuer URL — must match the `iss` claim inside Keycloak-issued JWTs.
   * Задаётся отдельным конфигом (`KEYCLOAK_ISSUER`), потому что адрес, по
   * которому приложение зовёт Keycloak, и адрес, которым Keycloak себя считает
   * (KC_HOSTNAME), могут различаться (см. ADR-0013).
   */
  get issuerUrl(): string {
    return this.issuer;
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

  private get cibaAuthUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/ext/ciba/auth`;
  }

  private get cibaCallbackUrl(): string {
    return `${this.cibaAuthUrl}/callback`;
  }

  /** CIBA шаг 1: заявка на backchannel-аутентификацию (ADR-0015). */
  async backchannelAuth(params: {
    loginHint: string;
    bindingMessage: string;
    scope?: string;
  }): Promise<{ auth_req_id: string; expires_in: number; interval?: number }> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      login_hint: params.loginHint,
      binding_message: params.bindingMessage,
      scope: params.scope ?? 'openid profile',
    });
    const { data } = await axios.post<{
      auth_req_id: string;
      expires_in: number;
      interval?: number;
    }>(this.cibaAuthUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data;
  }

  /** CIBA шаг 4: обмен подтверждённой заявки на токены. */
  async cibaGrant(authReqId: string): Promise<KeycloakTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'urn:openid:params:grant-type:ciba',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      auth_req_id: authReqId,
    });
    const { data } = await axios.post<KeycloakTokenResponse>(this.tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data;
  }

  /** CIBA шаг 3: решение канала — тем же Bearer-токеном, что пришёл в уведомлении. */
  async cibaCallback(params: { channelToken: string; decision: string }): Promise<void> {
    await axios.post(
      this.cibaCallbackUrl,
      { status: params.decision },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.channelToken}`,
        },
      },
    );
  }
}
