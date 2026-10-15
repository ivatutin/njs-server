import { ServiceUnavailableException } from '@nestjs/common';

/** Сколько секунд советовать клиенту подождать перед повтором (`Retry-After`). */
export const CONTACT_CHANGE_RETRY_AFTER_SECONDS = 5;

/**
 * `503` для `contact-change/verify` в семантике **B2-1** (ADR-0017 §3, решение координатора):
 * изменение **не применено** (компенсация удалась), `changeToken` жив, повтор разрешён.
 *
 * Отдельный класс нужен HTTP-слою, чтобы поставить заголовок `Retry-After`: статус и тело
 * остаются стандартными для Nest (`ServiceUnavailableException`).
 */
export class ContactChangeUnavailableError extends ServiceUnavailableException {
  constructor(readonly retryAfterSeconds: number = CONTACT_CHANGE_RETRY_AFTER_SECONDS) {
    super('Contact change could not be applied, retry is allowed');
  }
}
