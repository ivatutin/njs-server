import { RuleViolationError } from './rule-violation.error';
import { ErrorCode } from './error-code';

/**
 * Предъявленный `verificationToken` невалиден (не тот сценарий/контакт). HTTP: 422.
 *
 * Живёт в shared: токен предъявляют несколько контекстов (auth — sign-up/sign-in
 * по phone, user — set-password), а выдаёт его OTP-контекст.
 */
export class VerificationTokenInvalidError extends RuleViolationError {
  readonly code = ErrorCode.VERIFICATION_TOKEN_INVALID;

  constructor(message: string = 'Verification token is invalid') {
    super(message);
  }
}
