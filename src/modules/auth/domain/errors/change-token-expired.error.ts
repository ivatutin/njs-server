import { ErrorCode } from '@shared/domain/errors/error-code';
import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';

/**
 * `changeToken` неизвестен или истёк (TTL 10 минут, ADR-0017 §5).
 * HTTP: 422. Контрактный код: `ChangeTokenExpired` (контракт v1.3).
 */
export class ChangeTokenExpiredError extends RuleViolationError {
  readonly code = ErrorCode.CHANGE_TOKEN_EXPIRED;

  constructor(message: string = 'Change token is unknown or expired') {
    super(message);
  }
}
