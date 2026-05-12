import { Phone } from '../../../src/modules/user/domain/value-objects/phone.vo';
import { RuleViolationError } from '../../../src/shared/domain/errors/rule-violation.error';

describe('Phone', () => {
  it('null returns null Phone', () => {
    expect(Phone.create(null).getValue()).toBeNull();
  });

  it('undefined treated as null', () => {
    expect(Phone.create(undefined).getValue()).toBeNull();
  });

  it.each(['+79991234567', '+12025550100', '+447911123456'])('accepts E.164: %s', (v) => {
    expect(Phone.create(v).getValue()).toBe(v);
  });

  it.each(['89991234567', '+0123', '+1', '+abc', '12345', ''])('rejects %s', (v) => {
    expect(() => Phone.create(v)).toThrow(RuleViolationError);
  });

  it('trims whitespace before validation', () => {
    expect(Phone.create('  +79991234567  ').getValue()).toBe('+79991234567');
  });

  it('equals() compares by value', () => {
    const a = Phone.create('+79991234567');
    const b = Phone.create('+79991234567');
    const c = Phone.create('+79992222222');
    const nul = Phone.create(null);
    const nul2 = Phone.create(null);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(nul.equals(nul2)).toBe(true);
    expect(a.equals(nul)).toBe(false);
  });
});
