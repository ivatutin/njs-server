import { EntityNotFoundError } from '@shared/domain/errors/entity-not-found.error';

export class UserNotFoundError extends EntityNotFoundError {
  constructor(criterion: string) {
    super(`User not found: ${criterion}`);
  }
}
