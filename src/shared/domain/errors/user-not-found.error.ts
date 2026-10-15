import { EntityNotFoundError } from './entity-not-found.error';
import { ErrorCode } from './error-code';

/**
 * Пользователь не найден.
 * HTTP: 404. Контрактный код: `UserNotFound` (реестр, контракт v1.1).
 *
 * Живёт в shared: код нужен обоим контекстам — user (CRUD) и auth (смена контакта
 * ищет shadow-запись по `sub`).
 */
export class UserNotFoundError extends EntityNotFoundError {
  readonly code = ErrorCode.USER_NOT_FOUND;

  constructor(criterion: string) {
    super(`User not found: ${criterion}`);
  }
}
