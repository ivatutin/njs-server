import { UnauthorizedError } from '@shared/domain/errors/unauthorized.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Неверные credentials (sign-in, reauth, phone sign-in при неизвестном phone).
 * HTTP: 401. Контрактный код: `InvalidCredentials`.
 */
export class InvalidCredentialsError extends UnauthorizedError {
  readonly code = ErrorCode.INVALID_CREDENTIALS;

  constructor() {
    super('Invalid credentials');
  }
}
