jest.mock('axios');

import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SmsRuCallcheckProvider } from '../../src/modules/otp/infrastructure/call/smsru-callcheck.provider';

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

function build(config: Record<string, unknown> = {}): SmsRuCallcheckProvider {
  const values: Record<string, unknown> = {
    'smsru.apiId': 'test-api-id',
    'smsru.baseUrl': 'https://sms.ru',
    ...config,
  };
  const configService = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new SmsRuCallcheckProvider(configService);
}

function bodyOfCall(index: number): URLSearchParams {
  return mockedPost.mock.calls[index][1] as URLSearchParams;
}

describe('SmsRuCallcheckProvider', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('starts a check and maps the provider answer to the domain shape', async () => {
    mockedPost.mockResolvedValue({
      data: {
        status: 'OK',
        status_code: 100,
        check_id: '201737-542',
        call_phone: '78005008275',
        call_phone_pretty: '+7 (800) 500-8275',
      },
    });

    const result = await build().start({ phone: '+79991234567', userIp: '10.0.0.1' });

    expect(result).toEqual({ providerCheckId: '201737-542', callTo: '+7 (800) 500-8275' });
    expect(mockedPost).toHaveBeenCalledWith(
      'https://sms.ru/callcheck/add',
      expect.any(URLSearchParams),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    // Провайдер ждёт номер без «+», и IP именно пользователя.
    expect(bodyOfCall(0).get('phone')).toBe('79991234567');
    expect(bodyOfCall(0).get('ip')).toBe('10.0.0.1');
    expect(bodyOfCall(0).get('api_id')).toBe('test-api-id');
  });

  it('returns null when the provider refuses to start the check', async () => {
    mockedPost.mockResolvedValue({
      data: { status: 'ERROR', status_code: 202, status_text: 'phone is invalid' },
    });

    await expect(build().start({ phone: '+79991234567' })).resolves.toBeNull();
  });

  it('returns null without calling the provider when api_id is not configured', async () => {
    await expect(build({ 'smsru.apiId': '' }).start({ phone: '+79991234567' })).resolves.toBeNull();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('returns null on a network failure instead of throwing', async () => {
    mockedPost.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(build().start({ phone: '+79991234567' })).resolves.toBeNull();
  });

  it.each([
    ['400', 'pending'],
    ['401', 'verified'],
    ['402', 'expired'],
  ])('maps check_status %s to %s (401 means VERIFIED, not "unauthorized")', async (code, expected) => {
    mockedPost.mockResolvedValue({
      data: { status: 'OK', status_code: 100, check_status: code, check_status_text: 'x' },
    });

    await expect(build().status('201737-542')).resolves.toBe(expected);
  });

  it('accepts a numeric check_status from the provider', async () => {
    mockedPost.mockResolvedValue({ data: { status: 'OK', status_code: 100, check_status: 401 } });

    await expect(build().status('201737-542')).resolves.toBe('verified');
  });

  it('maps the request-level 402 (expired or unknown check_id) to expired', async () => {
    mockedPost.mockResolvedValue({ data: { status: 'ERROR', status_code: 402 } });

    await expect(build().status('201737-000')).resolves.toBe('expired');
  });

  it('maps the request-level 202 (invalid phone) to failed', async () => {
    mockedPost.mockResolvedValue({ data: { status: 'ERROR', status_code: 202 } });

    await expect(build().status('201737-000')).resolves.toBe('failed');
  });

  it('throws on an unexpected answer so a config error (301) stays visible', async () => {
    mockedPost.mockResolvedValue({
      data: { status: 'ERROR', status_code: 301, status_text: 'bad api_id' },
    });

    await expect(build().status('201737-542')).rejects.toThrow(/unexpected response/);
  });
});
