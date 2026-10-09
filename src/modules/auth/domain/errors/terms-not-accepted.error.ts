import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/** Регистрация без принятия условий. HTTP: 422. */
export class TermsNotAcceptedError extends RuleViolationError {
  readonly code = ErrorCode.TERMS_NOT_ACCEPTED;

  constructor() {
    super('Terms of service must be accepted to sign up');
  }
}
