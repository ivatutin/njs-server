import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import {
  PENDING_MINT_STORE,
  PendingMintStore,
} from '../../../domain/ports/pending-mint-store.port';
import { USER_TOKEN_ISSUER, UserTokenIssuer } from '../../../domain/ports/user-token-issuer.port';
import { HandleCibaChannelRequestCommand } from './handle-ciba-channel-request.command';

export interface CibaChannelDecisionResult {
  approved: boolean;
}

/**
 * Решение нашего «канала аутентификации» по уведомлению Keycloak (ADR-0015).
 *
 * Подтверждаем заявку **только** если это та заявка, которую мы сами начали
 * (совпадение `binding_message` + `sub` уведомления с ожидаемым identity-пользователем)
 * и заявка ещё не израсходована. Иначе — отказ: Keycloak завершит backchannel-запрос
 * ошибкой `access_denied`. Так схема «сам себе решатель» не превращается в
 * «выдать токены любому, кто знает client_secret».
 */
@Injectable()
export class HandleCibaChannelRequestUseCase implements UseCase<
  HandleCibaChannelRequestCommand,
  CibaChannelDecisionResult
> {
  private readonly logger = new Logger(HandleCibaChannelRequestUseCase.name);

  constructor(
    @Inject(USER_TOKEN_ISSUER) private readonly issuer: UserTokenIssuer,
    @Inject(PENDING_MINT_STORE) private readonly pendingMints: PendingMintStore,
  ) {}

  async execute(cmd: HandleCibaChannelRequestCommand): Promise<CibaChannelDecisionResult> {
    // Бросает `InvalidTokenError`, если Bearer не от Keycloak или `azp` не наш клиент.
    const { userId } = await this.issuer.verifyChannelToken(cmd.authorizationHeader);

    if (!cmd.bindingMessage) {
      this.logger.warn('channel request without binding_message — denied');
      return { approved: false };
    }

    const mint = await this.pendingMints.consume(cmd.bindingMessage);
    if (!mint) {
      this.logger.warn('channel request for an unknown or already used binding_message — denied');
      return { approved: false };
    }

    if (mint.keycloakId !== userId) {
      this.logger.warn('channel request subject does not match the pending mint — denied');
      return { approved: false };
    }

    this.scheduleApproval(cmd.authorizationHeader as string, userId, mint.purpose);
    return { approved: true };
  }

  /**
   * Callback отправляется **после** ответа 201, а не внутри обработки уведомления:
   * пока мы держим запрос Keycloak, его сессия ещё не зафиксирована и callback
   * отвергается с `403 invalid_token` (проверено живьём на 26.8). Сам 201 при
   * этом обязателен: без него Keycloak считает канал недоступным и валит
   * backchannel-запрос.
   */
  private scheduleApproval(authorizationHeader: string, userId: string, purpose: string): void {
    setTimeout(() => {
      void this.sendApproval(authorizationHeader, userId, purpose);
    }, CALLBACK_DELAY_MS);
  }

  private async sendApproval(
    authorizationHeader: string,
    userId: string,
    purpose: string,
  ): Promise<void> {
    const keycloakShort = userId.substring(0, 8);

    for (let attempt = 1; attempt <= CALLBACK_ATTEMPTS; attempt += 1) {
      try {
        await this.issuer.completeBackchannelAuth({ authorizationHeader, decision: 'SUCCEED' });
        this.logger.log(`channel approved ${purpose} mint (kc=${keycloakShort}...)`);
        return;
      } catch (err) {
        this.logger.warn(
          `channel callback attempt ${attempt}/${CALLBACK_ATTEMPTS} failed (kc=${keycloakShort}...): ${
            (err as Error).message
          }`,
        );
        if (attempt === CALLBACK_ATTEMPTS) {
          this.logger.error(
            `channel could not complete ${purpose} mint (kc=${keycloakShort}...): токены не будут выданы`,
          );
          return;
        }
        await delay(CALLBACK_RETRY_DELAY_MS);
      }
    }
  }
}

/** Пауза перед callback'ом: Keycloak должен успеть завершить свой запрос к каналу. */
const CALLBACK_DELAY_MS = 100;
const CALLBACK_RETRY_DELAY_MS = 300;
const CALLBACK_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
