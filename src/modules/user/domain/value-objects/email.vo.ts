import { ValueObject } from '@shared/domain/value-object';
import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';

export class Email extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Email {
    if (!value || !value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new RuleViolationError(`Invalid email: ${value}`);
    }
    return new Email(value.toLowerCase().trim());
  }

  toString(): string {
    return this.value;
  }
}
