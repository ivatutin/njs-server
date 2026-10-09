import { maskPhone } from '../../../src/modules/otp/domain/target-mask';

describe('maskPhone', () => {
  it('masks to the format required by the contract', () => {
    // Contract example `+7 (***) ***-12-34` — это шаблон формата:
    // видимыми остаются реальные последние 4 цифры номера.
    expect(maskPhone('+79991234567')).toBe('+7 (***) ***-45-67');
  });

  it('keeps only the last four digits visible', () => {
    const masked = maskPhone('+14155552671');

    expect(masked).toContain('26-71');
    expect(masked).not.toContain('5555');
    expect(masked).not.toContain('4155552671');
  });

  it('handles inputs that are too short to mask', () => {
    expect(maskPhone('+1234')).toBe('***');
  });
});
