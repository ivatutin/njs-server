import { HttpException, HttpStatus } from '@nestjs/common';
import { ContactChangeUnavailableError } from '../../domain/errors/contact-change-unavailable.error';

/** Минимальный контракт получателя заголовка: так хелпер не зависит от Express и легко тестируется. */
export interface RetryAfterHeaderSink {
  header(name: string, value: string): unknown;
}

/**
 * Консервативный совет для 503, у которого нет собственного значения.
 * batch-4 п.3: «ставить на любом 503, консервативное значение, например 30 с».
 */
export const SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS = 30;

/**
 * Ставит `Retry-After` на **любой** 503 (ADR-0017: «503 = ничего не применено, повтор разрешён»).
 *
 * Раньше заголовок был только у `ContactChangeUnavailableError`, а 503 из других путей
 * (падение Keycloak-адаптера, отказ отзыва доступа, терминальное состояние смены) уходили без него —
 * хотя ADR-0017 (`:18`, `:121`) обещает заголовок на 503 этого эндпоинта.
 *
 * Механизм общий (один хелпер, а не копипаста в каждом `catch`): классифицируем **по статусу**,
 * а если у ошибки есть своё значение (`ContactChangeUnavailableError.retryAfterSeconds`) — берём его.
 * Ошибки не-503 ничего не получают, поэтому хелпер безопасно вызывать из общего `catch`.
 */
export function applyRetryAfterHeader(err: unknown, res: RetryAfterHeaderSink): void {
  if (!(err instanceof HttpException) || err.getStatus() !== HttpStatus.SERVICE_UNAVAILABLE) {
    return;
  }

  const seconds =
    err instanceof ContactChangeUnavailableError
      ? err.retryAfterSeconds
      : SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS;

  res.header('Retry-After', String(seconds));
}
