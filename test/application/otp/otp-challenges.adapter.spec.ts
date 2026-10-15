import { ServiceUnavailableException } from '@nestjs/common';
import { OtpChallengesAdapter } from '../../../src/modules/otp/application/services/otp-challenges.adapter';
import { OtpChallenge } from '../../../src/modules/otp/domain/entities/otp-challenge.entity';
import { OtpExpiredError } from '../../../src/modules/otp/domain/errors/otp-expired.error';
import { OtpInvalidError } from '../../../src/modules/otp/domain/errors/otp-invalid.error';
import { OtpRateLimitedError } from '../../../src/modules/otp/domain/errors/otp-rate-limited.error';
import { EmailSender } from '../../../src/modules/otp/domain/ports/email-sender.port';
import { OtpChallengeStore } from '../../../src/modules/otp/domain/ports/otp-challenge-store.port';
import { OtpHasher } from '../../../src/modules/otp/domain/ports/otp-hasher.port';
import { OtpRateLimiter } from '../../../src/modules/otp/domain/ports/otp-rate-limiter.port';
import { SmsSender } from '../../../src/modules/otp/domain/ports/sms-sender.port';

const TARGET = 'new@example.com';
const PURPOSE = 'change-contact-new';

function activeChallenge(): OtpChallenge {
  return OtpChallenge.create({
    id: 'ch-1',
    channel: 'email',
    target: TARGET,
    purpose: PURPOSE,
    codeHash: 'hash-1',
  });
}

describe('OtpChallengesAdapter (shared-порт смены контакта, ADR-0017)', () => {
  let store: jest.Mocked<OtpChallengeStore>;
  let rateLimiter: jest.Mocked<OtpRateLimiter>;
  let hasher: jest.Mocked<OtpHasher>;
  let sms: jest.Mocked<SmsSender>;
  let email: jest.Mocked<EmailSender>;
  let adapter: OtpChallengesAdapter;

  beforeEach(() => {
    store = {
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(activeChallenge()),
      findActiveId: jest.fn().mockResolvedValue('ch-1'),
      deleteById: jest.fn(),
      findByProviderCheckId: jest.fn(),
      claimVerification: jest.fn(),
    } as unknown as jest.Mocked<OtpChallengeStore>;
    rateLimiter = {
      consume: jest.fn().mockResolvedValue({ allowed: true }),
    } as unknown as jest.Mocked<OtpRateLimiter>;
    hasher = {
      hash: jest.fn().mockResolvedValue('hash-1'),
      verify: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<OtpHasher>;
    sms = { send: jest.fn() } as unknown as jest.Mocked<SmsSender>;
    email = {
      send: jest.fn().mockResolvedValue({ accepted: true }),
    } as unknown as jest.Mocked<EmailSender>;

    adapter = new OtpChallengesAdapter(store, rateLimiter, hasher, sms, email);
  });

  it('стартует email-челлендж и передаёт письму свой messageId (= challengeId)', async () => {
    const started = await adapter.start({ channel: 'email', target: TARGET, purpose: PURPOSE });

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    const sent = email.send.mock.calls[0][0];
    expect(sent).toMatchObject({ target: TARGET, purpose: PURPOSE });
    expect(sent.messageId).toBe(started.challengeId);
    expect(started.expiresAt).toBeTruthy();
  });

  it('если канал доставки недоступен — 503, челлендж удаляется, SMS/письма нет', async () => {
    email.send.mockResolvedValue({ accepted: false, reason: 'not-configured' });

    await expect(
      adapter.start({ channel: 'email', target: TARGET, purpose: PURPOSE }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(store.deleteById).toHaveBeenCalledTimes(1);
  });

  it('телефонный канал уходит в SMS', async () => {
    await adapter.start({ channel: 'phone', target: '+79990000122', purpose: 'change-contact-new' });

    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('лимит: OtpRateLimited и никакого челленджа', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });

    await expect(
      adapter.start({ channel: 'email', target: TARGET, purpose: PURPOSE }),
    ).rejects.toThrow(OtpRateLimitedError);

    expect(store.save).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('verify ищет активный челлендж по паре (target, purpose)', async () => {
    store.findActiveId.mockResolvedValue(null);

    await expect(adapter.verify({ target: TARGET, purpose: PURPOSE, code: '000000' })).rejects.toThrow(
      OtpExpiredError,
    );
    expect(store.findActiveId).toHaveBeenCalledWith(TARGET, PURPOSE);
  });

  it('verify: неверный код — OtpInvalid и попытка сохранена', async () => {
    hasher.verify.mockResolvedValue(false);

    await expect(adapter.verify({ target: TARGET, purpose: PURPOSE, code: '111111' })).rejects.toThrow(
      OtpInvalidError,
    );
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.deleteById).not.toHaveBeenCalled();
  });

  it('verify: верный код гасит челлендж (одноразовость)', async () => {
    await adapter.verify({ target: TARGET, purpose: PURPOSE, code: '123456' });

    expect(store.deleteById).toHaveBeenCalledWith('ch-1');
  });

  it('неизвестный purpose — ошибка вызова, а не пользовательская', async () => {
    await expect(
      adapter.start({ channel: 'email', target: TARGET, purpose: 'unknown-purpose' }),
    ).rejects.toThrow(/unknown purpose/);
    expect(store.save).not.toHaveBeenCalled();
  });
});
