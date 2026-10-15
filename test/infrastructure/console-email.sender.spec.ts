import { ConfigService } from '@nestjs/config';
import { ConsoleEmailSender } from '../../src/modules/otp/infrastructure/email/console-email.sender';

function build(nodeEnv: string): ConsoleEmailSender {
  const values: Record<string, unknown> = { 'app.nodeEnv': nodeEnv };
  const configService = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new ConsoleEmailSender(configService);
}

describe('ConsoleEmailSender (ADR-0019)', () => {
  it('в dev принимает письмо (код уходит в лог)', async () => {
    const result = await build('development').send({
      target: 'new@example.com',
      code: '123456',
      purpose: 'change-contact-new',
      messageId: 'msg-1',
    });

    expect(result).toEqual({ accepted: true });
  });

  it('в production отказывает без боевого провайдера (fail-closed → 503)', async () => {
    const result = await build('production').send({
      target: 'new@example.com',
      code: '123456',
      purpose: 'change-contact-new',
      messageId: 'msg-1',
    });

    expect(result).toEqual({ accepted: false, reason: 'not-configured' });
  });
});
