import { UserDomainError } from './user-domain.error';

export class EmailAlreadyExistsError extends UserDomainError {
  constructor() {
    super('Email already exists');
  }
}
