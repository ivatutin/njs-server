jest.mock('axios');

import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DashaMailEmailSender } from '../../src/modules/otp/infrastructure/email/dashamail-email.sender';

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

function build(config: Record<string, unknown> = {}): DashaMailEmailSender {
  const values: Record<string, unknown> = {
    'dashamail.apiKey': 'test-key',
    'dashamail.fromEmail': 'noreply@example.com',
    'dashamail.fromName': 'Video Service',
    'dashamail.baseUrl': 'https://api.dashamail.com',
    ...config,
  };
  const configService = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new DashaMailEmailSender(configService);
}

function sendParams(): { target: string; code: string; purpose: 'change-contact-new'; messageId: string } {
  return {
    target: 'new@example.com',
    code: '123456',
    purpose: 'change-contact-new',
    messageId: 'msg-1',
  };
}

function axiosError(status: number): Error {
  return Object.assign(new Error(`http ${status}`), {
    isAxiosError: true,
    response: { status },
  });
}

describe('DashaMailEmailSender (ADR-0019)', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    // Автомок axios подменяет и `isAxiosError` — возвращаем ему поведение оригинала,
    // иначе адаптер не увидит сетевую ошибку и не начнёт ретраить.
    (axios.isAxiosError as unknown as jest.Mock).mockImplementation(
      (cause: unknown) => (cause as { isAxiosError?: boolean } | null)?.isAxiosError === true,
    );
  });

  it('передаёт свой message_id, HTML+plain-версии и заголовок X-Dashamail-Unsub-Ignore', async () => {
    mockedPost.mockResolvedValue({
      data: { response: { msg: { err_code: 0, text: 'OK' }, data: { transaction_id: 'msg-1' } } },
    });

    const result = await build().send(sendParams());

    expect(result).toEqual({ accepted: true });
    expect(mockedPost).toHaveBeenCalledWith(
      'https://api.dashamail.com/v2/transactional/messages',
      expect.objectContaining({
        message_id: 'msg-1',
        from_email: 'noreply@example.com',
        to: 'new@example.com',
        subject: 'Подтверждение нового контакта',
        message: expect.stringContaining('123456'),
        plain_text: expect.stringContaining('123456'),
      }),
      expect.objectContaining({
        timeout: expect.any(Number),
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'X-Dashamail-Unsub-Ignore': '1',
        }),
      }),
    );
  });

  it('отказывает без ключа/отправителя и не зовёт провайдера', async () => {
    const result = await build({ 'dashamail.apiKey': '' }).send(sendParams());

    expect(result).toEqual({ accepted: false, reason: 'not-configured' });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('мапит отказ провайдера (не подтверждён домен / адрес отписан) без ретраев', async () => {
    mockedPost.mockResolvedValue({
      data: { response: { msg: { err_code: 34, text: 'domain is not verified' } } },
    });

    const result = await build().send(sendParams());

    expect(result).toEqual({ accepted: false, reason: 'provider-error' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('незнакомая форма ответа — тоже отказ (ложный успех недопустим)', async () => {
    mockedPost.mockResolvedValue({ data: { id: 'provider-1' } });

    const result = await build().send(sendParams());

    expect(result).toEqual({ accepted: false, reason: 'provider-error' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('ретраит 5xx и сдаётся после третьей попытки', async () => {
    mockedPost.mockRejectedValue(axiosError(503));

    const result = await build().send(sendParams());

    expect(result).toEqual({ accepted: false, reason: 'provider-error' });
    expect(mockedPost).toHaveBeenCalledTimes(3);
  });

  it('успевает со второй попытки', async () => {
    mockedPost
      .mockRejectedValueOnce(axiosError(502))
      .mockResolvedValueOnce({
        data: { response: { msg: { err_code: 0, text: 'OK' } } },
      });

    const result = await build().send(sendParams());

    expect(result).toEqual({ accepted: true });
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });

  it('не ретраит 4xx (неверный запрос от повтора не станет верным)', async () => {
    mockedPost.mockRejectedValue(axiosError(400));

    const result = await build().send(sendParams());

    expect(result).toEqual({ accepted: false, reason: 'provider-error' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });
});
