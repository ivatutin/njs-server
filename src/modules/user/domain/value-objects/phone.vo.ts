import { ValueObject } from '@shared/domain/value-object';

export class Phone extends ValueObject<string | null> {
  private constructor(value: string | null) {
    super(value);
  }

  static create(value: string | null | undefined): Phone {
    if (value === null || value === undefined) {
      return new Phone(null);
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error('Phone cannot be empty string, use null instead');
    }
    if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) {
      throw new Error(`Invalid phone (expected E.164, e.g. +79991234567): ${value}`);
    }
    return new Phone(trimmed);
  }

  toString(): string | null {
    return this.value;
  }
}
