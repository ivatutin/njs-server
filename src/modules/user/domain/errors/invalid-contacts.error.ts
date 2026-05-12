import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';

export class InvalidContactsError extends RuleViolationError {
  constructor(message: string = 'User must have email or phone') {
    super(message);
  }
}
