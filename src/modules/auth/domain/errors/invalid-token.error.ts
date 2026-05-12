import { UnauthorizedError } from '@shared/domain/errors/unauthorized.error';

export class InvalidTokenError extends UnauthorizedError {
  constructor(reason: string = 'Invalid or expired token') {
    super(reason);
  }
}
