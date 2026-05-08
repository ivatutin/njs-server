import { UserDomainError } from './user-domain.error';

export class InvalidContactsError extends UserDomainError {
  constructor(message: string = 'User must have email or phone') {
    super(message);
  }
}
