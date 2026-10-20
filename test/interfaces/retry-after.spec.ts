import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import {
  applyRetryAfterHeader,
  SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS,
} from '../../src/modules/auth/interfaces/http/retry-after';
import {
  ContactChangeUnavailableError,
  CONTACT_CHANGE_RETRY_AFTER_SECONDS,
} from '../../src/modules/auth/domain/errors/contact-change-unavailable.error';

function fakeResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    res: {
      header: (name: string, value: string) => {
        headers[name] = value;
        return undefined;
      },
    },
  };
}

describe('applyRetryAfterHeader (batch-4 п.3: Retry-After на любом 503)', () => {
  it('свой 503 смена контакта (ContactChangeUnavailableError) — берём его значение', () => {
    const { headers, res } = fakeResponse();

    applyRetryAfterHeader(new ContactChangeUnavailableError(7), res);

    expect(headers['Retry-After']).toBe('7');
  });

  it('по умолчанию у ContactChangeUnavailableError — 5 секунд', () => {
    const { headers, res } = fakeResponse();

    applyRetryAfterHeader(new ContactChangeUnavailableError(), res);

    expect(headers['Retry-After']).toBe(String(CONTACT_CHANGE_RETRY_AFTER_SECONDS));
  });

  it('голый 503 (отзыв доступа / терминальное состояние смены) — консервативные 30 секунд', () => {
    const { headers, res } = fakeResponse();

    applyRetryAfterHeader(new ServiceUnavailableException('Access revocation failed'), res);

    expect(headers['Retry-After']).toBe(String(SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS));
    expect(SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS).toBe(30);
  });

  it('не-503 (422 и прочее) заголовок не получает', () => {
    const { headers, res } = fakeResponse();

    applyRetryAfterHeader(new UnprocessableEntityException('OtpInvalid'), res);
    applyRetryAfterHeader(new Error('boom'), res);
    applyRetryAfterHeader(undefined, res);

    expect(headers).toEqual({});
  });
});
