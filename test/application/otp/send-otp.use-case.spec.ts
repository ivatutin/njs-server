import { ContactLookup } from '../../../src/shared/application/contact-lookup.interface';
import { SendOtpCommand } from '../../../src/modules/otp/application/use-cases/send-otp/send-otp.command';
import { SendOtpUseCase } from '../../../src/modules/otp/application/use-cases/send-otp/send-otp.use-case';
import { ContactAlreadyExistsError } from '../../../src/modules/otp/domain/errors/contact-already-exists.error';
import { OtpRateLimitedError } from '../../../src/modules/otp/domain/errors/otp-rate-limited.error';
import { OtpChallengeStore } from '../../../src/modules/otp/domain/ports/otp-challenge-store.port';
import { OtpHasher } from '../../../src/modules/otp/domain/ports/otp-hasher.port';
import { OtpRateLimiter } from '../../../src/modules/otp/domain/ports/otp-rate-limiter.port';
import { SmsSender } from '../../../src/modules/otp/domain/ports/sms-sender.port';

const PHONE = '+79991234567';

describe('SendOtpUseCase', () => {
  let rateLimiter: jest.Mocked<OtpRateLimiter>;
  let contacts: jest.Mocked<ContactLookup>;
  let store: jest.Mocked<OtpChallengeStore>;
  let hasher: jest.Mocked<OtpHasher>;
  let sms: jest.Mocked<SmsSender>;
  let useCase: SendOtpUseCase;

  beforeEach(() => {
    rateLimiter = { consume: jest.fn().mockResolvedValue({ allowed: true }) };
    contacts = { existsByPhone: jest.fn().mockResolvedValue(false) };
    store = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findActiveId: jest.fn(),
      deleteById: jest.fn(),
    };
    hasher = { hash: jest.fn().mockResolvedValue('argon2id$hash'), verify: jest.fn() };
    sms = { send: jest.fn().mockResolvedValue(undefined) };
    useCase = new SendOtpUseCase(rateLimiter, contacts, store, hasher, sms);
  });

  it('creates a challenge, sends the code and returns the contract shape', async () => {
    const result = await useCase.execute(new SendOtpCommand('phone', PHONE, 'sign-up', '10.0.0.1'));

    expect(rateLimiter.consume).toHaveBeenCalledWith({ target: PHONE, ip: '10.0.0.1' });
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(result.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.channel).toBe('phone');
    expect(result.target).toBe('+7 (***) ***-45-67');
    expect(result.cooldownSeconds).toBe(60);
    expect(result.codeLength).toBe(6);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('never exposes the plaintext code in storage or in the response', async () => {
    const result = await useCase.execute(new SendOtpCommand('phone', PHONE, 'sign-up'));

    const sentCode = sms.send.mock.calls[0][0].code;
    const savedChallenge = store.save.mock.calls[0][0];

    expect(sentCode).toMatch(/^\d{6}$/);
    expect(savedChallenge.codeHash).toBe('argon2id$hash');
    expect(savedChallenge.codeHash).not.toBe(sentCode);
    expect(savedChallenge.toSnapshot()).not.toHaveProperty('code');
    expect(result).not.toHaveProperty('code');
  });

  it('rejects sign-up for a taken number with ContactAlreadyExists', async () => {
    contacts.existsByPhone.mockResolvedValue(true);

    await expect(useCase.execute(new SendOtpCommand('phone', PHONE, 'sign-up'))).rejects.toThrow(
      ContactAlreadyExistsError,
    );
    expect(store.save).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('returns OtpRateLimited with retryAfter before touching data', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });

    const error = await useCase
      .execute(new SendOtpCommand('phone', PHONE, 'sign-up'))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OtpRateLimitedError);
    expect((error as OtpRateLimitedError).details).toEqual({ retryAfter: 42 });
    expect(contacts.existsByPhone).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('keeps sign-in for an unknown number indiscernible: challenge stored, no SMS', async () => {
    const result = await useCase.execute(new SendOtpCommand('phone', PHONE, 'sign-in'));

    expect(result.challengeId).toBeDefined();
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('sends SMS for sign-in when the number is registered', async () => {
    contacts.existsByPhone.mockResolvedValue(true);

    await useCase.execute(new SendOtpCommand('phone', PHONE, 'sign-in'));

    expect(sms.send).toHaveBeenCalledTimes(1);
  });
});
