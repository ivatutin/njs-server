import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Logger } from 'nestjs-pino';
import { DomainError } from '@shared/domain/errors/domain.error';
import { EntityNotFoundError } from '@shared/domain/errors/entity-not-found.error';
import { ConflictError } from '@shared/domain/errors/conflict.error';
import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';
import { UnauthorizedError } from '@shared/domain/errors/unauthorized.error';
import { ForbiddenError } from '@shared/domain/errors/forbidden.error';

interface ErrorResponseBody {
  statusCode: number;
  timestamp: string;
  path: string;
  error: string;
  message: string | string[];
  details?: unknown;
}

/**
 * Глобальный exception filter:
 * - DomainError-наследники → семантические HTTP коды (404/409/422)
 * - NestJS HttpException → пробрасываем как есть (400 от Zod, ParseUUID, etc.)
 * - Неизвестные ошибки → 500 без раскрытия деталей в response
 *
 * Логирование через pino (4xx → warn, 5xx → error).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string; method: string; id?: string }>();

    const { status, error, message, details } = this.classify(exception);

    this.log(exception, request, status, message);

    const body: ErrorResponseBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error,
      message: status >= 500 ? 'Internal server error' : message,
    };
    if (details !== undefined && status < 500) {
      body.details = details;
    }

    response.status(status).json(body);
  }

  private classify(exception: unknown): {
    status: number;
    error: string;
    message: string | string[];
    details?: unknown;
  } {
    if (exception instanceof UnauthorizedError) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        error: exception.constructor.name,
        message: exception.message,
      };
    }
    if (exception instanceof ForbiddenError) {
      return {
        status: HttpStatus.FORBIDDEN,
        error: exception.constructor.name,
        message: exception.message,
      };
    }
    if (exception instanceof EntityNotFoundError) {
      return {
        status: HttpStatus.NOT_FOUND,
        error: exception.constructor.name,
        message: exception.message,
      };
    }
    if (exception instanceof ConflictError) {
      return {
        status: HttpStatus.CONFLICT,
        error: exception.constructor.name,
        message: exception.message,
      };
    }
    if (exception instanceof RuleViolationError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        error: exception.constructor.name,
        message: exception.message,
      };
    }
    if (exception instanceof DomainError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        error: exception.constructor.name,
        message: exception.message,
      };
    }
    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      const status = exception.getStatus();
      if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        return {
          status,
          error: (r.error as string) ?? exception.constructor.name,
          message: (r.message as string | string[]) ?? exception.message,
          details: r.errors ?? r.details,
        };
      }
      return {
        status,
        error: exception.constructor.name,
        message: typeof resp === 'string' ? resp : exception.message,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: exception instanceof Error ? exception.message : String(exception),
    };
  }

  private log(
    exception: unknown,
    request: { url: string; method: string; id?: string },
    status: number,
    message: string | string[],
  ): void {
    const msg = Array.isArray(message) ? message.join('; ') : message;
    const stack = exception instanceof Error ? exception.stack : undefined;
    const errName = exception instanceof Error ? exception.constructor.name : typeof exception;
    const context = AllExceptionsFilter.name;
    const line = `${request.method} ${request.url} [${status}] ${errName}: ${msg}`;

    if (status >= 500) {
      this.logger.error(line, stack, context);
    } else {
      this.logger.warn(line, context);
    }
  }
}
