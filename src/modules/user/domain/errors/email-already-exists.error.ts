import { ConflictError } from '@shared/domain/errors/conflict.error';

export class EmailAlreadyExistsError extends ConflictError {
  constructor() {
    super('Email already exists');
  }
}
