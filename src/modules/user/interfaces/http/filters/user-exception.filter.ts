import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { UserDomainError } from '../../../domain/errors/user-domain.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { EmailAlreadyExistsError } from '../../../domain/errors/email-already-exists.error';
import { PhoneAlreadyExistsError } from '../../../domain/errors/phone-already-exists.error';
import { InvalidContactsError } from '../../../domain/errors/invalid-contacts.error';

/**
 * Локальный фильтр модуля User: маппит UserDomainError в HTTP коды.
 * Будет заменён глобальным AllExceptionsFilter на Шаге 13.
 *
 * Прочие Error-ы из домена (например 'Cannot suspend pending user')
 * пока проходят дальше в default-handler (= 500). Переведём их
 * в специфичные классы или общий fallback на Шаге 13.
 */
@Catch(UserDomainError)
export class UserExceptionFilter implements ExceptionFilter {
  catch(exception: UserDomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    if (exception instanceof UserNotFoundError) {
      status = HttpStatus.NOT_FOUND;
    } else if (
      exception instanceof EmailAlreadyExistsError ||
      exception instanceof PhoneAlreadyExistsError
    ) {
      status = HttpStatus.CONFLICT;
    } else if (exception instanceof InvalidContactsError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: exception.constructor.name,
      message: exception.message,
    });
  }
}
