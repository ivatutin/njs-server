import { GetPhoneCallStatusCommand } from '../../../src/modules/otp/application/use-cases/get-phone-call-status/get-phone-call-status.command';
import { GetPhoneCallStatusUseCase } from '../../../src/modules/otp/application/use-cases/get-phone-call-status/get-phone-call-status.use-case';
import { PhoneCallRefresher } from '../../../src/modules/otp/application/services/phone-call-refresher.service';
import { OtpChallenge } from '../../../src/modules/otp/domain/entities/otp-challenge.entity';
import { OtpChallengeStore } from '../../../src/modules/otp/domain/ports/otp-challenge-store.port';
import { PhoneCallProvider } from '../../../src/modules/otp/domain/ports/phone-call-provider.port';
import { VerificationTokenIssuer } from '../../../src/modules/otp/domain/ports/verification-token.port';

const CALL_PARAMS = {
  id: 'call-1',
  channel: 'phone' as const,
  target: '+79991234567',
  purpose: 'sign-up' as const,
  providerCheckId: '201737-542',
  callTo: '+7 (800) 500-8275',
};

/** Челлендж в «памяти»: повторный GET должен видеть то, что сохранил предыдущий. */
function memoryStore(
  initial: OtpChallenge | null,
  options: { claimable?: boolean; parallelToken?: string } = {},
) {
  let current = initial;
  let claimed = false;
  const claimable = options.claimable ?? true;
  return {
    save: jest.fn(async (challenge: OtpChallenge) => {
      current = challenge;
    }),
    findById: jest.fn(async () => current),
    findActiveId: jest.fn(async () => current?.id ?? null),
    findByProviderCheckId: jest.fn(async () => current),
    claimVerification: jest.fn(async () => {
      if (claimable && !claimed) {
        claimed = true;
        return true;
      }
      // Параллельный процесс (вебхук или другой polling) уже выдал токен.
      if (options.parallelToken && current) {
        current = OtpChallenge.restore({
          ...current.toSnapshot(),
          verificationToken: options.parallelToken,
          providerStatus: 'verified',
        });
      }
      return false;
    }),
    deleteById: jest.fn(async () => {
      current = null;
    }),
  } as unknown as jest.Mocked<OtpChallengeStore>;
}

describe('GetPhoneCallStatusUseCase', () => {
  let store: jest.Mocked<OtpChallengeStore>;
  let calls: jest.Mocked<PhoneCallProvider>;
  let tokens: jest.Mocked<VerificationTokenIssuer>;
  let useCase: GetPhoneCallStatusUseCase;

  function build(
    challenge: OtpChallenge | null,
    options: { claimable?: boolean; parallelToken?: string } = {},
  ) {
    store = memoryStore(challenge, options);
    calls = { start: jest.fn(), status: jest.fn() };
    tokens = { issue: jest.fn().mockResolvedValue('verification-token'), consume: jest.fn() };
    useCase = new GetPhoneCallStatusUseCase(store, new PhoneCallRefresher(store, calls, tokens));
  }

  it('returns expired for an unknown challengeId (not 404/422)', async () => {
    build(null);

    await expect(useCase.execute(new GetPhoneCallStatusCommand('missing'))).resolves.toEqual({
      challengeId: 'missing',
      status: 'expired',
    });
    expect(calls.status).not.toHaveBeenCalled();
  });

  it('returns expired for a challenge of the other channel (code by SMS)', async () => {
    build(
      OtpChallenge.create({
        id: 'ch-otp',
        channel: 'phone',
        target: '+79991234567',
        purpose: 'sign-up',
        codeHash: 'argon2id$hash',
      }),
    );

    const result = await useCase.execute(new GetPhoneCallStatusCommand('ch-otp'));

    expect(result.status).toBe('expired');
    expect(calls.status).not.toHaveBeenCalled();
  });

  it('returns pending while the provider has not seen the call yet', async () => {
    build(OtpChallenge.createCall(CALL_PARAMS));
    calls.status.mockResolvedValue('pending');

    await expect(useCase.execute(new GetPhoneCallStatusCommand('call-1'))).resolves.toEqual({
      challengeId: 'call-1',
      status: 'pending',
    });
    expect(calls.status).toHaveBeenCalledWith('201737-542');
  });

  it('returns verified with a single-use token and repeats the same token on the next poll', async () => {
    build(OtpChallenge.createCall(CALL_PARAMS));
    calls.status.mockResolvedValue('verified');

    const first = await useCase.execute(new GetPhoneCallStatusCommand('call-1'));
    const second = await useCase.execute(new GetPhoneCallStatusCommand('call-1'));

    expect(first).toEqual({
      challengeId: 'call-1',
      status: 'verified',
      verificationToken: 'verification-token',
    });
    expect(second).toEqual(first);
    // Токен выдан один раз: подтверждённый челлендж больше не опрашивается.
    expect(tokens.issue).toHaveBeenCalledTimes(1);
    expect(tokens.issue).toHaveBeenCalledWith({ target: '+79991234567', purpose: 'sign-up' });
    expect(calls.status).toHaveBeenCalledTimes(1);
  });

  it('throttles provider polling between two immediate polls', async () => {
    build(OtpChallenge.createCall(CALL_PARAMS));
    calls.status.mockResolvedValue('pending');

    await useCase.execute(new GetPhoneCallStatusCommand('call-1'));
    await useCase.execute(new GetPhoneCallStatusCommand('call-1'));

    expect(calls.status).toHaveBeenCalledTimes(1);
  });

  it('keeps the last known state when the provider fails (polling must not 5xx)', async () => {
    build(OtpChallenge.createCall(CALL_PARAMS));
    calls.status.mockRejectedValue(new Error('ECONNRESET'));

    await expect(useCase.execute(new GetPhoneCallStatusCommand('call-1'))).resolves.toEqual({
      challengeId: 'call-1',
      status: 'pending',
    });
  });

  it('returns expired once the call window is over, without asking the provider', async () => {
    build(
      OtpChallenge.createCall({ ...CALL_PARAMS, now: new Date(Date.now() - 6 * 60_000) }),
    );

    const result = await useCase.execute(new GetPhoneCallStatusCommand('call-1'));

    expect(result.status).toBe('expired');
    expect(calls.status).not.toHaveBeenCalled();
  });

  it('returns failed with the provider reason and stops polling', async () => {
    build(OtpChallenge.createCall(CALL_PARAMS));
    calls.status.mockResolvedValue('failed');

    const first = await useCase.execute(new GetPhoneCallStatusCommand('call-1'));
    const second = await useCase.execute(new GetPhoneCallStatusCommand('call-1'));

    expect(first).toEqual({
      challengeId: 'call-1',
      status: 'failed',
      reason: 'provider rejected the verification',
    });
    expect(second).toEqual(first);
    expect(calls.status).toHaveBeenCalledTimes(1);
  });

  it('reports expired when the provider expired the check', async () => {
    build(OtpChallenge.createCall(CALL_PARAMS));
    calls.status.mockResolvedValue('expired');

    const first = await useCase.execute(new GetPhoneCallStatusCommand('call-1'));
    await useCase.execute(new GetPhoneCallStatusCommand('call-1'));

    expect(first.status).toBe('expired');
    expect(calls.status).toHaveBeenCalledTimes(1);
  });

  it('does not issue a second token when a parallel check already claimed it', async () => {
    build(OtpChallenge.createCall(CALL_PARAMS), {
      claimable: false,
      parallelToken: 'parallel-token',
    });
    calls.status.mockResolvedValue('verified');

    const result = await useCase.execute(new GetPhoneCallStatusCommand('call-1'));

    expect(result).toEqual({
      challengeId: 'call-1',
      status: 'verified',
      verificationToken: 'parallel-token',
    });
    expect(tokens.issue).not.toHaveBeenCalled();
  });
});
