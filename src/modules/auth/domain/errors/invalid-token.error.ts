import { UnauthorizedError } from '@shared/domain/errors/unauthorized.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Access/refresh token невалиден, просрочен или отозван.
 * HTTP: 401. Контрактный код: `InvalidToken` (реестр, контракт v1.1).
 */
export class InvalidTokenError extends UnauthorizedError {
  readonly code = ErrorCode.INVALID_TOKEN;

  constructor(reason: string = 'Invalid or expired token') {
    super(reason);
  }
}
