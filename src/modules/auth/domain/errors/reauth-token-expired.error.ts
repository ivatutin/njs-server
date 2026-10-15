import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * `X-Reauth-Token` не найден: истёк (TTL 5 минут), уже использован или
 * принадлежит другой сессии. HTTP: 422. Контрактный код: `ReauthTokenExpired`.
 *
 * Хранилище одноразовое (`GETDEL`) и не различает «истёк» и «использован»,
 * поэтому это ответ по умолчанию, когда токена нет.
 */
export class ReauthTokenExpiredError extends RuleViolationError {
  readonly code = ErrorCode.REAUTH_TOKEN_EXPIRED;

  constructor(message: string = 'Reauth token has expired or was already used') {
    super(message);
  }
}
