import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Имя не прошло **политику Keycloak** (контракт v1.7): пусто там, где реалм требует
 * (`firstName`/`lastName` — `required` для роли `user`), либо содержит запрещённые символы
 * (`person-name-prohibited-characters`).
 *
 * HTTP: 422. Контрактный код: `ProfileNameInvalid`.
 *
 * Почему не `503`: отказ пришёл **на данные клиента**, повтор не поможет — нужно исправить имя.
 * До v1.7 Keycloak-`400` маскировался под `ServiceUnavailable`, и клиент показывал
 * «сервис недоступен, повторите позже».
 */
export class ProfileNameInvalidError extends RuleViolationError {
  readonly code = ErrorCode.PROFILE_NAME_INVALID;

  constructor(message: string = 'Profile name is not accepted by the identity provider policy') {
    super(message);
  }
}
