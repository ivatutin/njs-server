import { UserId } from '../../../src/modules/user/domain/value-objects/user-id.vo';
import { RuleViolationError } from '../../../src/shared/domain/errors/rule-violation.error';

describe('UserId', () => {
  it('create() generates a UUID v4', () => {
    const id = UserId.create();
    expect(id.toString()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('create() returns different ids on each call', () => {
    expect(UserId.create().toString()).not.toBe(UserId.create().toString());
  });

  it('fromString() accepts non-empty value', () => {
    const id = UserId.fromString('abc-123');
    expect(id.toString()).toBe('abc-123');
  });

  it('fromString() throws on empty string', () => {
    expect(() => UserId.fromString('')).toThrow(RuleViolationError);
  });

  it('fromString() throws on whitespace-only', () => {
    expect(() => UserId.fromString('   ')).toThrow(RuleViolationError);
  });

  it('equals() compares by value', () => {
    const a = UserId.fromString('same-id');
    const b = UserId.fromString('same-id');
    const c = UserId.fromString('other');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
