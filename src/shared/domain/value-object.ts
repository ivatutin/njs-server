export abstract class ValueObject<T> {
  protected readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  equals(other: ValueObject<T>): boolean {
    if (other === null || other === undefined) return false;
    return JSON.stringify(this.value) === JSON.stringify(other.value);
  }

  getValue(): T {
    return this.value;
  }
}
