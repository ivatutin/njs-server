import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { ErrorCode } from '@shared/domain/errors/error-code';

/**
 * Пароль не проходит политику Keycloak. HTTP: 422.
 * Контракт требует `details.message` — отдаём формулировку из Keycloak
 * (может быть message-key вида `invalidPasswordMinLengthMessage`).
 */
export class PasswordPolicyViolationError extends RuleViolationError {
  readonly code = ErrorCode.PASSWORD_POLICY_VIOLATION;

  constructor(message: string) {
    super('Password does not meet the password policy', { message });
  }
}
