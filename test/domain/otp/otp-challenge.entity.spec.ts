import { OtpChallenge } from '../../../src/modules/otp/domain/entities/otp-challenge.entity';
import { OtpExpiredError } from '../../../src/modules/otp/domain/errors/otp-expired.error';
import { OtpTooManyAttemptsError } from '../../../src/modules/otp/domain/errors/otp-too-many-attempts.error';

const BASE_PARAMS = {
  id: 'ch-1',
  channel: 'phone' as const,
  target: '+79991234567',
  purpose: 'sign-up' as const,
  codeHash: 'argon2id$hash',
};

describe('OtpChallenge', () => {
  it('starts with zero attempts and a 5-minute TTL', () => {
    const now = new Date('2026-10-08T10:00:00.000Z');
    const challenge = OtpChallenge.create({ ...BASE_PARAMS, now });

    expect(challenge.attempts).toBe(0);
    expect(challenge.remainingAttempts).toBe(5);
    expect(challenge.expiresAt.toISOString()).toBe('2026-10-08T10:05:00.000Z');
    expect(challenge.isExpired(now)).toBe(false);
  });

  it('is expired at and after expiresAt', () => {
    const challenge = OtpChallenge.create(BASE_PARAMS);
    const afterExpiry = new Date(challenge.expiresAt.getTime() + 1);

    expect(challenge.isExpired(challenge.expiresAt)).toBe(true);
    expect(challenge.isExpired(afterExpiry)).toBe(true);
    expect(() => challenge.ensureUsable(afterExpiry)).toThrow(OtpExpiredError);
  });

  it('counts failed attempts and locks on the 5th one', () => {
    const challenge = OtpChallenge.create(BASE_PARAMS);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      challenge.registerFailedAttempt();
      expect(challenge.attempts).toBe(attempt);
      expect(challenge.isLocked()).toBe(false);
    }

    expect(() => challenge.registerFailedAttempt()).toThrow(OtpTooManyAttemptsError);
    expect(challenge.attempts).toBe(5);
    expect(challenge.isLocked()).toBe(true);
    expect(challenge.remainingAttempts).toBe(0);
  });

  it('refuses a locked challenge via ensureUsable', () => {
    const challenge = OtpChallenge.restore({ ...BASE_PARAMS, attempts: 5, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1000).toISOString() });
    expect(() => challenge.ensureUsable()).toThrow(OtpTooManyAttemptsError);
  });

  it('round-trips through a snapshot preserving attempts and expiry', () => {
    const challenge = OtpChallenge.create(BASE_PARAMS);
    challenge.registerFailedAttempt();

    const restored = OtpChallenge.restore(challenge.toSnapshot());

    expect(restored.id).toBe(challenge.id);
    expect(restored.attempts).toBe(1);
    expect(restored.codeHash).toBe('argon2id$hash');
    expect(restored.expiresAt.toISOString()).toBe(challenge.expiresAt.toISOString());
  });

  it('never carries the plaintext code in its snapshot', () => {
    const challenge = OtpChallenge.create(BASE_PARAMS);

    expect(challenge.toSnapshot()).not.toHaveProperty('code');
    expect(Object.keys(challenge.toSnapshot()).sort()).toEqual([
      'attempts',
      'channel',
      'codeHash',
      'createdAt',
      'expiresAt',
      'id',
      'purpose',
      'target',
    ]);
  });
});
