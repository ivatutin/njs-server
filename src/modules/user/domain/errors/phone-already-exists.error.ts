import { ConflictError } from '@shared/domain/errors/conflict.error';

export class PhoneAlreadyExistsError extends ConflictError {
  constructor() {
    super('Phone already exists');
  }
}
