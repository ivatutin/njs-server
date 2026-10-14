import { ServiceUnavailableException } from '@nestjs/common';
import { ContactLookup } from '../../../src/shared/application/contact-lookup.interface';
import { ContactAlreadyExistsError } from '../../../src/shared/domain/errors/contact-already-exists.error';
import { StartPhoneCallCommand } from '../../../src/modules/otp/application/use-cases/start-phone-call/start-phone-call.command';
import { StartPhoneCallUseCase } from '../../../src/modules/otp/application/use-cases/start-phone-call/start-phone-call.use-case';
import { OtpRateLimitedError } from '../../../src/modules/otp/domain/errors/otp-rate-limited.error';
import { OtpChallengeStore } from '../../../src/modules/otp/domain/ports/otp-challenge-store.port';
import { OtpRateLimiter } from '../../../src/modules/otp/domain/ports/otp-rate-limiter.port';
import { PhoneCallProvider } from '../../../src/modules/otp/domain/ports/phone-call-provider.port';

const PHONE = '+79991234567';

describe('StartPhoneCallUseCase', () => {
  let rateLimiter: jest.Mocked<OtpRateLimiter>;
  let contacts: jest.Mocked<ContactLookup>;
  let store: jest.Mocked<OtpChallengeStore>;
  let calls: jest.Mocked<PhoneCallProvider>;
  let useCase: StartPhoneCallUseCase;

  beforeEach(() => {
    rateLimiter = { consume: jest.fn().mockResolvedValue({ allowed: true }) };
    contacts = {
      existsByPhone: jest.fn().mockResolvedValue(false),
      findKeycloakIdByPhone: jest.fn(),
    };
    store = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findActiveId: jest.fn(),
      findByProviderCheckId: jest.fn(),
      claimVerification: jest.fn(),
      deleteById: jest.fn(),
    };
    calls = {
      start: jest.fn().mockResolvedValue({
        providerCheckId: '201737-542',
        callTo: '+7 (800) 500-8275',
      }),
      status: jest.fn(),
    };
    useCase = new StartPhoneCallUseCase(rateLimiter, contacts, store, calls);
  });

  it('creates a call challenge and returns the contract v1.2 shape', async () => {
    const result = await useCase.execute(new StartPhoneCallCommand('phone', PHONE, 'sign-up'));

    expect(result.channel).toBe('phone');
    expect(result.method).toBe('call');
    expect(result.callTo).toBe('+7 (800) 500-8275');
    expect(result.cooldownSeconds).toBe(60);
    expect(result.otpFallback).toBe(true);
    expect(result.challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const saved = store.save.mock.calls[0][0];
    expect(saved.method).toBe('call');
    expect(saved.providerCheckId).toBe('201737-542');
    expect(saved.codeHash).toBeNull();
  });

  it('passes the user IP (not the server one) to the provider', async () => {
    await useCase.execute(new StartPhoneCallCommand('phone', PHONE, 'sign-in', '10.0.0.1'));

    expect(calls.start).toHaveBeenCalledWith({ phone: PHONE, userIp: '10.0.0.1' });
  });

  it('applies the same rate limits as OTP send', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 58 });

    await expect(
      useCase.execute(new StartPhoneCallCommand('phone', PHONE, 'sign-in', '10.0.0.1')),
    ).rejects.toThrow(OtpRateLimitedError);
    expect(calls.start).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('rejects a taken number for sign-up with ContactAlreadyExists', async () => {
    contacts.existsByPhone.mockResolvedValue(true);

    await expect(
      useCase.execute(new StartPhoneCallCommand('phone', PHONE, 'sign-up')),
    ).rejects.toThrow(ContactAlreadyExistsError);
    expect(calls.start).not.toHaveBeenCalled();
  });

  it('starts a challenge for sign-in even when the number is unknown (anti-enumeration)', async () => {
    const result = await useCase.execute(new StartPhoneCallCommand('phone', PHONE, 'sign-in'));

    expect(result.method).toBe('call');
    expect(calls.start).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it('answers 503 without a new contract code when the provider is unavailable', async () => {
    calls.start.mockResolvedValue(null);

    await expect(
      useCase.execute(new StartPhoneCallCommand('phone', PHONE, 'sign-up')),
    ).rejects.toThrow(ServiceUnavailableException);
    // Заявки у провайдера нет — подтверждать нечего, челлендж не создаём.
    expect(store.save).not.toHaveBeenCalled();
  });

  it('treats a provider answer without a callTo as unavailable', async () => {
    calls.start.mockResolvedValue({ providerCheckId: '201737-542', callTo: '' });

    await expect(
      useCase.execute(new StartPhoneCallCommand('phone', PHONE, 'sign-up')),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(store.save).not.toHaveBeenCalled();
  });
});
