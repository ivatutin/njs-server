import { EmailAlreadyExistsError } from '../../domain/errors/email-already-exists.error';
import { PhoneAlreadyExistsError } from '../../domain/errors/phone-already-exists.error';
import { InvalidContactsError } from '../../domain/errors/invalid-contacts.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';

interface PrismaError {
  code?: string;
  message?: string;
  meta?: {
    target?: string[] | string;
    modelName?: string;
    code?: string;
    constraint?: string;
    cause?: string;
  };
}

/**
 * Преобразует Prisma errors в доменные исключения и пробрасывает их.
 * Если ошибка не распознана — пробрасывает оригинал.
 */
export function mapPrismaError(err: unknown): never {
  const e = err as PrismaError;

  // CHECK constraint violation: P2010 wraps Postgres 23514
  if (e?.code === 'P2010' && e.meta?.code === '23514') {
    const constraint = e.meta?.constraint ?? '';
    if (constraint.includes('email_or_phone_required')) {
      throw new InvalidContactsError();
    }
    if (constraint.includes('active_requires_verified_contact')) {
      throw new InvalidContactsError('Cannot activate user without any verified contact');
    }
    if (constraint.includes('email_verified_requires_email')) {
      throw new InvalidContactsError('Cannot mark email as verified: email is not set');
    }
    if (constraint.includes('phone_verified_requires_phone')) {
      throw new InvalidContactsError('Cannot mark phone as verified: phone is not set');
    }
    throw new InvalidContactsError(`Domain invariant violated: ${constraint}`);
  }

  // UNIQUE constraint
  if (e?.code === 'P2002') {
    const target = e.meta?.target;
    const fields = Array.isArray(target) ? target : target ? [target] : [];
    const message = e.message ?? '';
    const haystack = fields.join(',') + ' ' + message;
    if (/email/i.test(haystack)) {
      throw new EmailAlreadyExistsError();
    }
    if (/phone/i.test(haystack)) {
      throw new PhoneAlreadyExistsError();
    }
    throw new Error(`Unique constraint violated: ${haystack}`);
  }

  // Record not found (delete/update on non-existent)
  if (e?.code === 'P2025') {
    throw new UserNotFoundError(e.meta?.cause ?? 'unknown');
  }

  throw err;
}
