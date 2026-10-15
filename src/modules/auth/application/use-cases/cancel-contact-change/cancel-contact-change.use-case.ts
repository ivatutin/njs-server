import { Inject, Injectable, Logger } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { ChangeTokenExpiredError } from '../../../domain/errors/change-token-expired.error';
import {
  CHANGE_TOKEN_STORE,
  ChangeTokenStore,
} from '../../../domain/ports/change-token-store.port';
import { CancelContactChangeCommand } from './cancel-contact-change.command';

/**
 * `POST /users/me/contact-change/cancel` (ADR-0017 §5): снимает смену — запись и слот активной
 * смены. Это **штатный путь перевыпуска кода** для фронта: повторный `request` при активной смене
 * отвечает `422 ContactChangeAlreadyPending`, поэтому «код не пришёл» = `cancel` → `request`.
 *
 * Токен не одноразовый, поэтому `cancel` идемпотентен по смыслу: неизвестный (или истёкший) токен —
 * `422 ChangeTokenExpired`, а известный снимается независимо от состояния (`pending`/`applied`/`failed`).
 * Чужой токен снять нельзя: он привязан к `keycloakId` (иначе не даём подтверждения существования).
 */
@Injectable()
export class CancelContactChangeUseCase implements UseCase<CancelContactChangeCommand, void> {
  private readonly logger = new Logger(CancelContactChangeUseCase.name);

  constructor(@Inject(CHANGE_TOKEN_STORE) private readonly changes: ChangeTokenStore) {}

  async execute(cmd: CancelContactChangeCommand): Promise<void> {
    const record = await this.changes.find(cmd.changeToken);
    if (!record || record.keycloakId !== cmd.keycloakId) throw new ChangeTokenExpiredError();

    await this.changes.remove(cmd.changeToken);
    this.logger.log(`contact-change cancelled kc=${cmd.keycloakId.substring(0, 8)}...`);
  }
}
