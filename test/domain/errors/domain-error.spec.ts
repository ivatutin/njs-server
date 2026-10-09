import * as fs from 'node:fs';
import * as path from 'node:path';
import { DomainError } from '../../../src/shared/domain/errors/domain.error';
import { ConflictError } from '../../../src/shared/domain/errors/conflict.error';
import { EntityNotFoundError } from '../../../src/shared/domain/errors/entity-not-found.error';
import { RuleViolationError } from '../../../src/shared/domain/errors/rule-violation.error';
import { UnauthorizedError } from '../../../src/shared/domain/errors/unauthorized.error';
import { ErrorCode } from '../../../src/shared/domain/errors/error-code';
import { InvalidCredentialsError } from '../../../src/modules/auth/domain/errors/invalid-credentials.error';
import { InvalidTokenError } from '../../../src/modules/auth/domain/errors/invalid-token.error';
import { EmailAlreadyExistsError } from '../../../src/modules/user/domain/errors/email-already-exists.error';
import { PhoneAlreadyExistsError } from '../../../src/modules/user/domain/errors/phone-already-exists.error';
import { UserNotFoundError } from '../../../src/modules/user/domain/errors/user-not-found.error';
import { InvalidContactsError } from '../../../src/modules/user/domain/errors/invalid-contacts.error';
import { OtpRateLimitedError } from '../../../src/modules/otp/domain/errors/otp-rate-limited.error';

/**
 * Снапшот реестра `ErrorCode` — гардрейл против drift
 * (см. «Протокол расширения контракта ошибок» в `docs/auth-v1-contract.md`).
 */
const REGISTRY_CODES = [
  // контракт v1.0
  'InvalidCredentials',
  'ContactAlreadyExists',
  'ContactNotFound',
  'ContactAlreadyVerified',
  'OtpInvalid',
  'OtpExpired',
  'OtpTooManyAttempts',
  'OtpRateLimited',
  'VerificationTokenInvalid',
  'VerificationTokenExpired',
  'ChangeTokenExpired',
  'ReauthTokenInvalid',
  'ReauthTokenExpired',
  'ContactChangeAlreadyPending',
  'PasswordPolicyViolation',
  'TermsNotAccepted',
  // контракт v1.1 (аддитивно, уже реализованы на бэке)
  'InvalidToken',
  'InvalidContacts',
  'UserNotFound',
  // Phase 3 (ADR-0012): на провод пока не уходят
  'SocialAuthFailed',
  'ProviderAccountLinked',
];

/** Промежуточные базовые классы: кода контракта у них нет и быть не должно. */
const BASE_ERROR_CLASSES = new Set([
  'DomainError',
  'ConflictError',
  'EntityNotFoundError',
  'ForbiddenError',
  'RuleViolationError',
  'UnauthorizedError',
]);

type ErrorClass = new (message?: string) => DomainError;

/** Обходит `src/**\/*.error.ts` и собирает все наследники `DomainError`. */
function collectErrorClasses(): Map<string, ErrorClass> {
  const found = new Map<string, ErrorClass>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.error.ts')) {
        const module_ = require(full) as Record<string, unknown>;
        for (const [name, value] of Object.entries(module_)) {
          if (typeof value !== 'function') continue;
          if (!(value.prototype instanceof DomainError)) continue;
          found.set(name, value as ErrorClass);
        }
      }
    }
  };
  walk(path.resolve(__dirname, '..', '..', '..', 'src'));
  return found;
}

describe('DomainError.code', () => {
  // Класс без явного code: имя класса совпадает с кодом контракта —
  // так будут выглядеть ошибки OTP-сервиса (Phase 0).
  class OtpInvalidError extends RuleViolationError {}

  it('derives the code from the class name without the "Error" suffix', () => {
    expect(new OtpInvalidError('wrong code').code).toBe('OtpInvalid');
  });

  it('keeps intermediate base classes throwable', () => {
    expect(new ConflictError('dup').code).toBe('Conflict');
    expect(new RuleViolationError('rule').code).toBe('RuleViolation');
    expect(new EntityNotFoundError('gone').code).toBe('EntityNotFound');
    expect(new UnauthorizedError('nope').code).toBe('Unauthorized');
  });

  it('lets a concrete error declare an explicit contract code', () => {
    class AlreadyVerifiedError extends RuleViolationError {
      readonly code = ErrorCode.CONTACT_ALREADY_VERIFIED;
    }
    expect(new AlreadyVerifiedError('x').code).toBe('ContactAlreadyVerified');
  });

  it('keeps Error semantics intact (name, message, prototype, stack)', () => {
    const error = new OtpInvalidError('wrong code');
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('OtpInvalidError');
    expect(error.message).toBe('wrong code');
    expect(error.stack).toBeDefined();
  });

  it('exposes the codes the client registry expects for module errors', () => {
    const cases: Array<[DomainError, string]> = [
      [new InvalidCredentialsError(), ErrorCode.INVALID_CREDENTIALS],
      [new EmailAlreadyExistsError(), ErrorCode.CONTACT_ALREADY_EXISTS],
      [new PhoneAlreadyExistsError(), ErrorCode.CONTACT_ALREADY_EXISTS],
      [new InvalidTokenError(), ErrorCode.INVALID_TOKEN],
      [new UserNotFoundError('id=1'), ErrorCode.USER_NOT_FOUND],
      [new InvalidContactsError(), ErrorCode.INVALID_CONTACTS],
    ];

    for (const [error, expectedCode] of cases) {
      expect(error.code).toBe(expectedCode);
    }
  });

  it('does not leak the class name for errors sharing one contract code', () => {
    expect(new EmailAlreadyExistsError().code).not.toBe('EmailAlreadyExistsError');
    expect(new PhoneAlreadyExistsError().code).toBe(new EmailAlreadyExistsError().code);
  });

  it('carries structured details required by the contract', () => {
    expect(new OtpRateLimitedError(42).details).toEqual({ retryAfter: 42 });
  });

  it('pins the ErrorCode registry snapshot (contract v1.1)', () => {
    expect(Object.values(ErrorCode).sort()).toEqual([...REGISTRY_CODES].sort());
  });

  describe('drift guardrails', () => {
    const errorClasses = collectErrorClasses();

    it('discovers every concrete error class in src/**/*.error.ts', () => {
      expect([...errorClasses.keys()]).toEqual(
        expect.arrayContaining([
          'InvalidCredentialsError',
          'InvalidTokenError',
          'EmailAlreadyExistsError',
          'PhoneAlreadyExistsError',
          'UserNotFoundError',
          'InvalidContactsError',
        ]),
      );
    });

    it('gives every concrete error a non-empty code that is in the registry', () => {
      const concrete = [...errorClasses.entries()].filter(([name]) => !BASE_ERROR_CLASSES.has(name));
      expect(concrete.length).toBeGreaterThan(0);

      for (const [, ErrorClass] of concrete) {
        const { code } = new ErrorClass('boom');
        expect(code).toBeTruthy();
        expect(Object.values(ErrorCode)).toContain(code);
      }
    });

    it('pins the exact set of codes that can reach the wire today', () => {
      const codes = [...errorClasses.entries()]
        .filter(([name]) => !BASE_ERROR_CLASSES.has(name))
        .map(([, ErrorClass]) => new ErrorClass('boom').code);

      expect([...new Set(codes)].sort()).toEqual([
        'ContactAlreadyExists',
        'InvalidContacts',
        'InvalidCredentials',
        'InvalidToken',
        'OtpExpired',
        'OtpInvalid',
        'OtpRateLimited',
        'OtpTooManyAttempts',
        'UserNotFound',
      ]);
    });
  });
});
