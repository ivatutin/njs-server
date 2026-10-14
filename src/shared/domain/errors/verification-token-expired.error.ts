import { RuleViolationError } from './rule-violation.error';
import { ErrorCode } from './error-code';

/**
 * Срок жизни `verificationToken` истёк или токен уже использован. HTTP: 422.
 *
 * Хранилище DELETE-на-чтении не различает «истёк» и «использован», поэтому этот
 * код — ответ по умолчанию, когда токен не найден.
 */
export class VerificationTokenExpiredError extends RuleViolationError {
  readonly code = ErrorCode.VERIFICATION_TOKEN_EXPIRED;

  constructor(message: string = 'Verification token has expired') {
    super(message);
  }
}
