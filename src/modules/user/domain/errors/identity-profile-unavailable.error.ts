import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Identity provider недоступен при записи профиля — **ничего не применено**,
 * повтор разрешён (контракт v1.6: `503 ServiceUnavailable`).
 *
 * Наследуем Nest-исключение, чтобы HTTP-слой отдал ровно `503` и `error: "Service Unavailable"`
 * без ручного маппинга (тот же приём, что у `ContactChangeUnavailableError` в auth).
 * Не `DomainError`: это инфраструктурный отказ, а не нарушение бизнес-правила, и в реестре
 * доменных кодов ему места нет.
 */
export class IdentityProfileUnavailableError extends ServiceUnavailableException {
  constructor(message = 'Profile could not be updated in the identity provider, retry is allowed') {
    super(message);
  }
}
