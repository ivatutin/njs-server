import { UserDomainError } from './user-domain.error';

export class UserNotFoundError extends UserDomainError {
  constructor(criterion: string) {
    super(`User not found: ${criterion}`);
  }
}
