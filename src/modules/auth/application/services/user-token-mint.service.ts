import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TokenPair } from '../../domain/ports/identity-provider.port';
import { PENDING_MINT_STORE, PendingMintStore } from '../../domain/ports/pending-mint-store.port';
import { USER_TOKEN_ISSUER, UserTokenIssuer } from '../../domain/ports/user-token-issuer.port';

/**
 * Минт токенов для только что подтверждённого пользователя (ADR-0015).
 *
 * Заявка регистрируется **до** backchannel-запроса: наш канал подтвердит её
 * только если узнает свой `binding_message`, а сверка идёт по `keycloakId`
 * из уведомления. Так «сам себе решатель» не превращается в «выдать токены
 * любому»: без свежей верификации телефона заявки в Redis нет.
 */
@Injectable()
export class UserTokenMintService {
  private readonly logger = new Logger(UserTokenMintService.name);

  constructor(
    @Inject(USER_TOKEN_ISSUER) private readonly issuer: UserTokenIssuer,
    @Inject(PENDING_MINT_STORE) private readonly pendingMints: PendingMintStore,
  ) {}

  async mint(params: {
    loginHint: string;
    keycloakId: string;
    purpose: string;
    phone: string | null;
  }): Promise<TokenPair> {
    const bindingMessage = randomUUID();
    await this.pendingMints.save(bindingMessage, {
      loginHint: params.loginHint,
      keycloakId: params.keycloakId,
      purpose: params.purpose,
      phone: params.phone,
    });

    let step = 'backchannel';
    try {
      const started = await this.issuer.startBackchannelAuth({
        loginHint: params.loginHint,
        bindingMessage,
      });
      step = 'token-exchange';
      return await this.issuer.exchangeBackchannelAuth(started.authReqId, started.intervalSeconds);
    } catch (err) {
      // Токены не выданы — это отказ инфраструктуры, а не клиента: отдаём 503
      // без нового кода контракта (тот же подход, что у звонкового канала).
      this.logger.error(
        `token mint failed at ${step} for ${params.purpose} (kc=${params.keycloakId.substring(0, 8)}...): ${describeError(err)}`,
      );
      throw new ServiceUnavailableException('Token issuance failed');
    }
  }
}

/** Диагностика без доменных деталей: сообщение + статус и тело ответа Keycloak. */
function describeError(err: unknown): string {
  const error = err as { message?: string; response?: { status?: number; data?: unknown } };
  const status = error?.response?.status;
  const body = error?.response?.data ? ` body=${JSON.stringify(error.response.data)}` : '';
  return `${error?.message ?? 'unknown error'}${status ? ` [status ${status}]` : ''}${body}`;
}
