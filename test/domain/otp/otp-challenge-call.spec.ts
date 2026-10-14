import {
  OtpChallenge,
  OtpChallengeSnapshot,
} from '../../../src/modules/otp/domain/entities/otp-challenge.entity';
import {
  CALL_POLL_MIN_SECONDS,
  CALL_WINDOW_SECONDS,
  VERIFICATION_TOKEN_TTL_SECONDS,
} from '../../../src/modules/otp/domain/otp-policy';

const PARAMS = {
  id: 'call-1',
  channel: 'phone' as const,
  target: '+79991234567',
  purpose: 'sign-up' as const,
  providerCheckId: '201737-542',
  callTo: '+7 (800) 500-8275',
};

describe('OtpChallenge (call channel, ADR-0014)', () => {
  it('starts with the provider window TTL, no code hash and pending state', () => {
    const now = new Date('2026-10-14T10:00:00.000Z');
    const challenge = OtpChallenge.createCall({ ...PARAMS, now });

    expect(challenge.method).toBe('call');
    expect(challenge.codeHash).toBeNull();
    expect(challenge.providerCheckId).toBe('201737-542');
    expect(challenge.callTo).toBe('+7 (800) 500-8275');
    expect(challenge.providerStatus).toBe('pending');
    expect(challenge.isVerified()).toBe(false);
    expect(challenge.expiresAt.toISOString()).toBe(
      new Date(now.getTime() + CALL_WINDOW_SECONDS * 1000).toISOString(),
    );
  });

  it('throttles provider polling to CALL_POLL_MIN_SECONDS', () => {
    const now = new Date('2026-10-14T10:00:00.000Z');
    const challenge = OtpChallenge.createCall({ ...PARAMS, now });

    expect(challenge.shouldPollProvider(now)).toBe(true);

    challenge.recordProviderCheck('pending', now);

    expect(
      challenge.shouldPollProvider(new Date(now.getTime() + (CALL_POLL_MIN_SECONDS - 1) * 1000)),
    ).toBe(false);
    expect(
      challenge.shouldPollProvider(new Date(now.getTime() + CALL_POLL_MIN_SECONDS * 1000)),
    ).toBe(true);
  });

  it('keeps the issued token and outlives the call window after verification', () => {
    const now = new Date('2026-10-14T10:00:00.000Z');
    const challenge = OtpChallenge.createCall({ ...PARAMS, now });
    // Подтверждение приходит под конец пятиминутного окна.
    const late = new Date(now.getTime() + (CALL_WINDOW_SECONDS - 1) * 1000);

    challenge.markVerified('verification-token', late);

    expect(challenge.isVerified()).toBe(true);
    expect(challenge.providerStatus).toBe('verified');
    expect(challenge.verificationToken).toBe('verification-token');
    expect(challenge.expiresAt.getTime()).toBe(
      late.getTime() + VERIFICATION_TOKEN_TTL_SECONDS * 1000,
    );
    // Через минуту после подтверждения челлендж ещё жив — фронт успеет забрать токен.
    expect(challenge.isExpired(new Date(late.getTime() + 60_000))).toBe(false);
  });

  it('records a terminal failure with a reason', () => {
    const challenge = OtpChallenge.createCall(PARAMS);

    challenge.markFailed('provider rejected the verification');

    expect(challenge.providerStatus).toBe('failed');
    expect(challenge.failureReason).toBe('provider rejected the verification');
    expect(challenge.isVerified()).toBe(false);
  });

  it('restores snapshots recorded before v1.2 (no method) as OTP challenges', () => {
    const legacy = {
      id: 'ch-legacy',
      channel: 'phone',
      target: '+79991234567',
      purpose: 'sign-up',
      codeHash: 'argon2id$hash',
      attempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as unknown as OtpChallengeSnapshot;

    const restored = OtpChallenge.restore(legacy);

    expect(restored.method).toBe('otp');
    expect(restored.codeHash).toBe('argon2id$hash');
  });
});
