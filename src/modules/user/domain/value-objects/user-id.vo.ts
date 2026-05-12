import { ValueObject } from '@shared/domain/value-object';
import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { randomUUID } from 'crypto';

export class UserId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(): UserId {
    return new UserId(randomUUID());
  }

  static fromString(value: string): UserId {
    if (!value || value.trim().length === 0) {
      throw new RuleViolationError('UserId cannot be empty');
    }
    return new UserId(value);
  }

  toString(): string {
    return this.value;
  }
}
