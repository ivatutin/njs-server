import { EntityNotFoundError } from '@shared/domain/errors/entity-not-found.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Пользователь не найден.
 * HTTP: 404. Контрактный код: `UserNotFound` (реестр, контракт v1.1).
 */
export class UserNotFoundError extends EntityNotFoundError {
  readonly code = ErrorCode.USER_NOT_FOUND;

  constructor(criterion: string) {
    super(`User not found: ${criterion}`);
  }
}
