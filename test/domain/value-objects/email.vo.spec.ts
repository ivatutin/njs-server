import { Email } from '../../../src/modules/user/domain/value-objects/email.vo';
import { RuleViolationError } from '../../../src/shared/domain/errors/rule-violation.error';

describe('Email', () => {
  it.each(['user@example.com', 'a.b+tag@sub.example.co'])('accepts valid email: %s', (v) => {
    expect(Email.create(v).toString()).toBe(v.toLowerCase());
  });

  it('lowercases and trims', () => {
    expect(Email.create('  USER@TEST.COM  ').toString()).toBe('user@test.com');
  });

  it.each(['', 'not-an-email', '@x.com', 'a@', 'a@b', 'a b@c.com'])(
    'rejects invalid email: %s',
    (v) => {
      expect(() => Email.create(v)).toThrow(RuleViolationError);
    },
  );

  it('equals() compares by normalized value', () => {
    expect(Email.create('A@B.com').equals(Email.create('a@b.com'))).toBe(true);
    expect(Email.create('a@b.com').equals(Email.create('c@d.com'))).toBe(false);
  });
});
