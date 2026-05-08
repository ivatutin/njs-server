import { UserDomainError } from './user-domain.error';

export class PhoneAlreadyExistsError extends UserDomainError {
  constructor() {
    super('Phone already exists');
  }
}
