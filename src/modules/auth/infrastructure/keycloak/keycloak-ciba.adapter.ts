import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvalidTokenError } from '../../domain/errors/invalid-token.error';
import { TokenPair } from '../../domain/ports/identity-provider.port';
import {
  BackchannelAuthStart,
  ChannelDecision,
  UserTokenIssuer,
} from '../../domain/ports/user-token-issuer.port';
import { KeycloakHttpClient } from './keycloak-http.client';
import { KeycloakJwtVerifier } from './keycloak-jwt.verifier';

/** Сколько раз пробуем забрать токены, пока Keycloak считает заявку нерешённой. */
const POLL_ATTEMPTS = 4;
/** RFC-штраф за слишком частый опрос (CIBA `slow_down`). */
const SLOW_DOWN_STEP_MS = 5_000;

/**
 * CIBA-реализация `UserTokenIssuer` (ADR-0015).
 *
 * Живьём проверено на 26.8: `201` на уведомление канала ≠ завершённая
 * аутентификация — её завершает callback с решением, после чего токены отдаются
 * сразу (штрафа `interval` в нашем флоу нет). Короткий retry на
 * `authorization_pending` оставлен на случай гонки: callback мог ещё не долететь.
 */
@Injectable()
export class KeycloakCibaAdapter implements UserTokenIssuer {
  private readonly logger = new Logger(KeycloakCibaAdapter.name);
  private readonly clientId: string;

  constructor(
    private readonly http: KeycloakHttpClient,
    private readonly verifier: KeycloakJwtVerifier,
    config: ConfigService,
  ) {
    this.clientId = config.get<string>('keycloak.clientId')!;
  }

  async startBackchannelAuth(params: {
    loginHint: string;
    bindingMessage: string;
  }): Promise<BackchannelAuthStart> {
    const res = await this.http.backchannelAuth(params);
    return { authReqId: res.auth_req_id, intervalSeconds: res.interval ?? 5 };
  }

  async exchangeBackchannelAuth(authReqId: string, intervalSeconds: number): Promise<TokenPair> {
    let waitMs = Math.max(intervalSeconds, 0) * 1000;

    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
      await delay(waitMs);
      try {
        const tokens = await this.http.cibaGrant(authReqId);
        return {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
        };
      } catch (err) {
        const reason = authErrorReason(err);
        if (reason === 'slow_down') {
          // RFC: слишком частый опрос — увеличиваем интервал ещё на 5 секунд.
          waitMs += SLOW_DOWN_STEP_MS;
          this.logger.debug(`backchannel auth: slow down (attempt ${attempt})`);
          continue;
        }
        if (reason === 'authorization_pending') {
          this.logger.debug(`backchannel auth still pending (attempt ${attempt})`);
          continue;
        }
        throw err;
      }
    }

    throw new Error(`CIBA token request did not succeed after ${POLL_ATTEMPTS} attempts`);
  }

  async verifyChannelToken(authorizationHeader: string | null): Promise<{ userId: string }> {
    const token = extractBearer(authorizationHeader);
    if (!token) throw new InvalidTokenError('Channel request has no bearer token');

    try {
      const claims = await this.verifier.verify(token);
      if (claims.azp !== this.clientId) {
        throw new Error(`unexpected azp: ${String(claims.azp)}`);
      }
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        throw new Error('channel token has no subject');
      }
      return { userId: claims.sub };
    } catch (err) {
      this.logger.warn(`channel token rejected: ${(err as Error).message}`);
      throw new InvalidTokenError('Channel token is invalid');
    }
  }

  async completeBackchannelAuth(params: {
    authorizationHeader: string;
    decision: ChannelDecision;
  }): Promise<void> {
    const token = extractBearer(params.authorizationHeader);
    if (!token) throw new InvalidTokenError('Channel request has no bearer token');
    try {
      await this.http.cibaCallback({ channelToken: token, decision: params.decision });
    } catch (err) {
      // Keycloak не логирует отказы callback'а на INFO/WARN — без этого тела
      // причина «403 на подтверждении» не видна ни нам, ни в его логах.
      const response = (err as { response?: { status?: number; data?: unknown } })?.response;
      this.logger.error(
        `CIBA callback rejected (${response?.status ?? 'n/a'}): ${
          response?.data ? JSON.stringify(response.data) : (err as Error).message
        }`,
      );
      throw err;
    }
  }
}

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value;
}

function authErrorReason(err: unknown): string | null {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
