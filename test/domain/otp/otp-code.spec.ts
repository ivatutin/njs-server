import { generateOtpCode } from '../../../src/modules/otp/domain/otp-code';

describe('generateOtpCode', () => {
  it('returns 6 digits by default', () => {
    const code = generateOtpCode();

    expect(code).toMatch(/^\d{6}$/);
  });

  it('honours an explicit length', () => {
    expect(generateOtpCode(4)).toMatch(/^\d{4}$/);
  });

  it('does not repeat itself constantly', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOtpCode()));

    expect(codes.size).toBeGreaterThan(1);
  });
});
