import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import {
  OTP_CHALLENGE_STORE,
  OtpChallengeStore,
} from '../../../domain/ports/otp-challenge-store.port';
import { PhoneCallRefresher } from '../../services/phone-call-refresher.service';
import { RefreshPhoneCallStatusCommand } from './refresh-phone-call-status.command';

/**
 * Вход для вебхука провайдера: тело запроса не считается доверенным, оно лишь
 * подсказывает, *какую* из наших заявок перепроверить (ADR-0014). Состояние
 * всегда берётся из авторизованного запроса к провайдеру.
 *
 * Троттлинг здесь намеренно не применяется: вебхук — редкое событие и означает
 * «состояние изменилось», поэтому проверяем сразу.
 */
@Injectable()
export class RefreshPhoneCallStatusUseCase implements UseCase<
  RefreshPhoneCallStatusCommand,
  boolean
> {
  private readonly logger = new Logger(RefreshPhoneCallStatusUseCase.name);

  constructor(
    @Inject(OTP_CHALLENGE_STORE) private readonly store: OtpChallengeStore,
    private readonly refresher: PhoneCallRefresher,
  ) {}

  /** `true` — заявка найдена и перепроверена; `false` — чужой/неизвестный `check_id`. */
  async execute(cmd: RefreshPhoneCallStatusCommand): Promise<boolean> {
    const challenge = await this.store.findByProviderCheckId(cmd.providerCheckId);
    if (!challenge) {
      this.logger.warn(`callback for unknown provider check_id (ignored)`);
      return false;
    }

    const refreshed = await this.refresher.refresh(challenge);
    this.logger.log(
      `callback applied: challenge=${challenge.id} status=${refreshed.providerStatus ?? 'pending'}`,
    );
    return true;
  }
}
