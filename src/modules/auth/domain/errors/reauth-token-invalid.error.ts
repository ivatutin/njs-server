import { UnauthorizedError } from '@shared/domain/errors/unauthorized.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * `X-Reauth-Token` отсутствует или принадлежит другому пользователю.
 * HTTP: 401. Контрактный код: `ReauthTokenInvalid`.
 */
export class ReauthTokenInvalidError extends UnauthorizedError {
  readonly code = ErrorCode.REAUTH_TOKEN_INVALID;

  constructor(message: string = 'Reauth token is invalid') {
    super(message);
  }
}
