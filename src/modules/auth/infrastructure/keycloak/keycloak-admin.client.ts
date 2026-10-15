import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/** Пользователь в представлении Keycloak Admin API (только нужные поля). */
export interface KeycloakAdminUserRepresentation {
  id: string;
  username?: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  /** Наши атрибуты: `phoneNumber`, `phoneVerified` (ADR-0015). */
  attributes?: Record<string, string[]>;
}

/** Событие пользователя из Admin Events API. */
export interface KeycloakAdminEventRepresentation {
  type?: string;
  time?: number;
  userId?: string;
  details?: Record<string, string>;
}

interface ServiceAccountToken {
  access_token: string;
  expires_in: number;
}

/**
 * Тонкий клиент Keycloak Admin API: client_credentials-токен (кэшируется до
 * истечения) + нужные REST-вызовы. Держим axios здесь, чтобы адаптер работал
 * с простыми типами и доменными ошибками.
 */
@Injectable()
export class KeycloakAdminClient {
  private readonly logger = new Logger(KeycloakAdminClient.name);
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('keycloak.url')!;
    this.realm = config.get<string>('keycloak.realm')!;
    this.clientId = config.get<string>('keycloak.clientId')!;
    this.clientSecret = config.get<string>('keycloak.clientSecret')!;
  }

  private get adminUrl(): string {
    return `${this.baseUrl}/admin/realms/${this.realm}`;
  }

  private get tokenUrl(): string {
    return `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
  }

  /** Создаёт пользователя; id берём из заголовка Location (Keycloak его отдаёт). */
  async createUser(representation: Record<string, unknown>): Promise<string | null> {
    const response = await axios.post(`${this.adminUrl}/users`, representation, await this.auth());
    const location = response.headers?.location as string | undefined;
    if (!location) return null;
    return location.split('/').filter(Boolean).pop() ?? null;
  }

  async findUsersByEmail(email: string): Promise<KeycloakAdminUserRepresentation[]> {
    const response = await axios.get<KeycloakAdminUserRepresentation[]>(`${this.adminUrl}/users`, {
      ...(await this.auth()),
      params: { email, exact: true },
    });
    return response.data;
  }

  /** Поиск по username: нужен phone-пользователям (у них нет email). */
  async findUsersByUsername(username: string): Promise<KeycloakAdminUserRepresentation[]> {
    const response = await axios.get<KeycloakAdminUserRepresentation[]>(`${this.adminUrl}/users`, {
      ...(await this.auth()),
      params: { username, exact: true },
    });
    return response.data;
  }

  /** Пользователь по id (`sub` токена); `null`, если его нет (Keycloak отдаёт 404). */
  async findUserById(userId: string): Promise<KeycloakAdminUserRepresentation | null> {
    try {
      const response = await axios.get<KeycloakAdminUserRepresentation>(
        `${this.adminUrl}/users/${userId}`,
        await this.auth(),
      );
      return response.data;
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
      throw err;
    }
  }

  /** Устанавливает пароль (не temporary — смена, а не приглашение). */
  async resetPassword(userId: string, password: string): Promise<void> {
    await axios.put(
      `${this.adminUrl}/users/${userId}/reset-password`,
      { type: 'password', value: password, temporary: false },
      {
        ...(await this.auth()),
        headers: { ...(await this.auth()).headers, 'Content-Type': 'application/json' },
      },
    );
  }

  /** Обновляет пользователя (PUT /users/{id}): email/emailVerified и наши атрибуты (ADR-0017). */
  async updateUser(userId: string, representation: Record<string, unknown>): Promise<void> {
    await axios.put(`${this.adminUrl}/users/${userId}`, representation, {
      ...(await this.auth()),
      headers: { ...(await this.auth()).headers, 'Content-Type': 'application/json' },
    });
  }

  /** Гасит все сессии пользователя (refresh-токены становятся недействительными). */
  async logoutUser(userId: string): Promise<void> {
    await axios.post(`${this.adminUrl}/users/${userId}/logout`, null, await this.auth());
  }

  /**
   * Просит Keycloak отправить письмо-подтверждение.
   *
   * `client_id` НЕ передаём: ссылка привязывается к клиенту, а у бэкенд-клиента
   * `app-backend` нет браузерного flow — с `client_id` ссылка уводит на страницу
   * логина вместо подтверждения. Когда у фронта появится свой Keycloak-клиент,
   * сюда можно добавить `client_id` + `redirect_uri`, чтобы возвращать
   * пользователя в приложение (сейчас фронт поллит `GET /users/me`).
   */
  async sendVerifyEmail(userId: string): Promise<void> {
    await axios.put(`${this.adminUrl}/users/${userId}/send-verify-email`, null, await this.auth());
  }

  /**
   * События пользователя. `dateFrom` Keycloak принимает ТОЛЬКО в формате
   * `yyyy-MM-dd` (ISO-8601 с временем отвечает 400) — поэтому окно задаётся датой.
   */
  async findUserEvents(params: {
    type: string;
    dateFrom: string;
    max?: number;
  }): Promise<KeycloakAdminEventRepresentation[]> {
    const response = await axios.get<KeycloakAdminEventRepresentation[]>(
      `${this.adminUrl}/events`,
      { ...(await this.auth()), params },
    );
    return response.data;
  }

  /**
   * Отправляет письмо с набором required actions (например, `UPDATE_PASSWORD`
   * для «забыл пароль»). `client_id` не передаём — по той же причине, что и в
   * `sendVerifyEmail` (у бэкенд-клиента нет браузерного flow).
   */
  async executeActionsEmail(
    userId: string,
    actions: string[],
    lifespanSeconds: number,
  ): Promise<void> {
    const params = new URLSearchParams({ lifespan: String(lifespanSeconds) });
    await axios.put(`${this.adminUrl}/users/${userId}/execute-actions-email`, actions, {
      ...(await this.auth()),
      headers: { ...(await this.auth()).headers, 'Content-Type': 'application/json' },
      params,
    });
  }

  private async auth(): Promise<{ headers: Record<string, string> }> {
    return { headers: { Authorization: `Bearer ${await this.accessToken()}` } };
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 5_000) {
      return this.cachedToken.value;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const response = await axios.post<ServiceAccountToken>(this.tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.cachedToken = {
      value: response.data.access_token,
      expiresAt: now + response.data.expires_in * 1000,
    };
    this.logger.debug('Obtained Keycloak service-account token');
    return this.cachedToken.value;
  }
}
