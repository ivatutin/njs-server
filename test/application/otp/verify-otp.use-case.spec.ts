import { VerifyOtpCommand } from '../../../src/modules/otp/application/use-cases/verify-otp/verify-otp.command';
import { VerifyOtpUseCase } from '../../../src/modules/otp/application/use-cases/verify-otp/verify-otp.use-case';
import {
  OtpChallenge,
  OtpChallengeSnapshot,
} from '../../../src/modules/otp/domain/entities/otp-challenge.entity';
import { OtpExpiredError } from '../../../src/modules/otp/domain/errors/otp-expired.error';
import { OtpInvalidError } from '../../../src/modules/otp/domain/errors/otp-invalid.error';
import { OtpTooManyAttemptsError } from '../../../src/modules/otp/domain/errors/otp-too-many-attempts.error';
import { OtpChallengeStore } from '../../../src/modules/otp/domain/ports/otp-challenge-store.port';
import { OtpHasher } from '../../../src/modules/otp/domain/ports/otp-hasher.port';
import { VerificationTokenIssuer } from '../../../src/modules/otp/domain/ports/verification-token.port';

function snapshot(overrides: Partial<OtpChallengeSnapshot> = {}): OtpChallengeSnapshot {
  return {
    id: 'ch-1',
    channel: 'phone',
    target: '+79991234567',
    purpose: 'sign-up',
    codeHash: 'argon2id$hash',
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('VerifyOtpUseCase', () => {
  let store: jest.Mocked<OtpChallengeStore>;
  let hasher: jest.Mocked<OtpHasher>;
  let tokens: jest.Mocked<VerificationTokenIssuer>;
  let useCase: VerifyOtpUseCase;

  beforeEach(() => {
    store = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findActiveId: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };
    hasher = { hash: jest.fn(), verify: jest.fn().mockResolvedValue(true) };
    tokens = { issue: jest.fn().mockResolvedValue('verification-token'), consume: jest.fn() };
    useCase = new VerifyOtpUseCase(store, hasher, tokens);
  });

  it('throws OtpExpired when the challenge does not exist', async () => {
    store.findById.mockResolvedValue(null);

    await expect(useCase.execute(new VerifyOtpCommand('ch-1', '123456'))).rejects.toThrow(
      OtpExpiredError,
    );
  });

  it('throws OtpExpired for a stale challenge', async () => {
    store.findById.mockResolvedValue(
      OtpChallenge.restore(snapshot({ expiresAt: new Date(Date.now() - 1000).toISOString() })),
    );

    await expect(useCase.execute(new VerifyOtpCommand('ch-1', '123456'))).rejects.toThrow(
      OtpExpiredError,
    );
  });

  it('counts a wrong code as a failed attempt and persists the counter', async () => {
    hasher.verify.mockResolvedValue(false);
    store.findById.mockResolvedValue(OtpChallenge.restore(snapshot()));

    await expect(useCase.execute(new VerifyOtpCommand('ch-1', '000000'))).rejects.toThrow(
      OtpInvalidError,
    );

    const saved = store.save.mock.calls[0][0];
    expect(saved.attempts).toBe(1);
    expect(store.deleteById).not.toHaveBeenCalled();
  });

  it('locks the challenge on the 5th wrong attempt', async () => {
    hasher.verify.mockResolvedValue(false);
    store.findById.mockResolvedValue(OtpChallenge.restore(snapshot({ attempts: 4 })));

    await expect(useCase.execute(new VerifyOtpCommand('ch-1', '000000'))).rejects.toThrow(
      OtpTooManyAttemptsError,
    );

    expect(store.save.mock.calls[0][0].attempts).toBe(5);
  });

  it('refuses a locked challenge without checking the code', async () => {
    store.findById.mockResolvedValue(OtpChallenge.restore(snapshot({ attempts: 5 })));

    await expect(useCase.execute(new VerifyOtpCommand('ch-1', '123456'))).rejects.toThrow(
      OtpTooManyAttemptsError,
    );
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('on success deletes the challenge and issues a one-shot verification token', async () => {
    store.findById.mockResolvedValue(OtpChallenge.restore(snapshot()));

    const result = await useCase.execute(new VerifyOtpCommand('ch-1', '123456'));

    expect(hasher.verify).toHaveBeenCalledWith('argon2id$hash', '123456');
    expect(store.deleteById).toHaveBeenCalledWith('ch-1');
    expect(tokens.issue).toHaveBeenCalledWith({ target: '+79991234567', purpose: 'sign-up' });
    expect(store.save).not.toHaveBeenCalled();
    expect(result).toEqual({
      challengeId: 'ch-1',
      verified: true,
      verificationToken: 'verification-token',
    });
  });
});
