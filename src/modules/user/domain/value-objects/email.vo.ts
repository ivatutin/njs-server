import { ValueObject } from '@shared/domain/value-object';
import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';

export class Email extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Email {
    const normalized = value?.toLowerCase().trim();
    if (!normalized || !normalized.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new RuleViolationError(`Invalid email: ${value}`);
    }
    return new Email(normalized);
  }

  toString(): string {
    return this.value;
  }
}
