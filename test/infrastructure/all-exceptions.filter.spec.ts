import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from '../../src/shared/infrastructure/filters/all-exceptions.filter';
import { ErrorCode } from '../../src/shared/domain/errors/error-code';
import { InvalidCredentialsError } from '../../src/modules/auth/domain/errors/invalid-credentials.error';
import { InvalidTokenError } from '../../src/modules/auth/domain/errors/invalid-token.error';
import { EmailAlreadyExistsError } from '../../src/modules/user/domain/errors/email-already-exists.error';
import { PhoneAlreadyExistsError } from '../../src/modules/user/domain/errors/phone-already-exists.error';
import { UserNotFoundError } from '../../src/modules/user/domain/errors/user-not-found.error';
import { InvalidContactsError } from '../../src/modules/user/domain/errors/invalid-contacts.error';
import { OtpRateLimitedError } from '../../src/modules/otp/domain/errors/otp-rate-limited.error';

interface ErrorResponseBody {
  statusCode: number;
  timestamp: string;
  path: string;
  error: string;
  message: string | string[];
  details?: unknown;
}

interface Captured {
  status: number;
  body: ErrorResponseBody;
}

/**
 * Contract-тест транспортного формата ошибок.
 *
 * Клиент (vue-app-base) матчит ошибки строго по строке `error` из реестра
 * `ErrorCode` (ADR-0012), поэтому имя класса в контракт попадать не должно.
 */
describe('AllExceptionsFilter (error contract)', () => {
  let filter: AllExceptionsFilter;
  let logger: { warn: jest.Mock; error: jest.Mock };

  const REQUEST = { url: '/api/v1/auth/sign-in', method: 'POST', id: 'req-1' };

  beforeEach(() => {
    logger = { warn: jest.fn(), error: jest.fn() };
    filter = new AllExceptionsFilter(logger as unknown as Logger);
  });

  function run(exception: unknown): Captured {
    const captured = { status: 0, body: undefined as unknown as ErrorResponseBody };
    const response = {
      status(code: number) {
        captured.status = code;
        return {
          json(payload: ErrorResponseBody) {
            captured.body = payload;
            return payload;
          },
        };
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => REQUEST,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);
    return captured;
  }

  it('emits the contract code (not the class name) and status for domain errors', () => {
    const cases: Array<[Error, number, string]> = [
      [new InvalidCredentialsError(), HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS],
      [new EmailAlreadyExistsError(), HttpStatus.CONFLICT, ErrorCode.CONTACT_ALREADY_EXISTS],
      [new PhoneAlreadyExistsError(), HttpStatus.CONFLICT, ErrorCode.CONTACT_ALREADY_EXISTS],
      [new UserNotFoundError('id=42'), HttpStatus.NOT_FOUND, ErrorCode.USER_NOT_FOUND],
      [new InvalidContactsError(), HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.INVALID_CONTACTS],
      [new InvalidTokenError('Token has been revoked'), HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_TOKEN],
    ];

    for (const [exception, expectedStatus, expectedCode] of cases) {
      const { status, body } = run(exception);

      expect(status).toBe(expectedStatus);
      expect(body.statusCode).toBe(expectedStatus);
      expect(body.error).toBe(expectedCode);
      expect(body.message).toBe(exception.message);
    }
  });

  it('returns the string the client matches on for a duplicate contact', () => {
    const { status, body } = run(new EmailAlreadyExistsError());

    expect(status).toBe(409);
    expect(body.error).toBe('ContactAlreadyExists');
    expect(body.error).not.toBe('EmailAlreadyExistsError');
    expect(body.error).not.toBe('ConflictError');
  });

  it('shapes the body with ISO timestamp and request path, without details', () => {
    const { body } = run(new InvalidCredentialsError());

    expect(body.path).toBe(REQUEST.url);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(body).not.toHaveProperty('details');
  });

  it('emits DomainError details required by the contract (OtpRateLimited.retryAfter)', () => {
    const { status, body } = run(new OtpRateLimitedError(42));

    expect(status).toBe(422);
    expect(body.error).toBe(ErrorCode.OTP_RATE_LIMITED);
    expect(body.details).toEqual({ retryAfter: 42 });
  });

  it('passes NestJS HttpException through with its own status and details', () => {
    const exception = new HttpException(
      { error: 'Bad Request', message: ['email must be an email'], errors: [{ path: ['email'] }] },
      HttpStatus.BAD_REQUEST,
    );

    const { status, body } = run(exception);

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error).toBe('Bad Request');
    expect(body.message).toEqual(['email must be an email']);
    expect(body.details).toEqual([{ path: ['email'] }]);
  });

  it('masks unknown errors as 500 without leaking details', () => {
    const { status, body } = run(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error).toBe('InternalServerError');
    expect(body.message).toBe('Internal server error');
    expect(body).not.toHaveProperty('details');
  });

  it('logs 4xx as warn and 5xx as error', () => {
    run(new InvalidCredentialsError());
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();

    run(new Error('boom'));
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
