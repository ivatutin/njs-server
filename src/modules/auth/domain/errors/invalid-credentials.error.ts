import { UnauthorizedError } from '@shared/domain/errors/unauthorized.error';

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid credentials');
  }
}
