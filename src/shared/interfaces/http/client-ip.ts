import { Request } from 'express';

/**
 * IP вызывающего для per-IP лимитов и для провайдеров, которые просят именно
 * адрес пользователя (SMS.ru callcheck: по нему выбирается номер для звонка).
 * Учитываем X-Forwarded-For за reverse-proxy.
 */
export function resolveClientIp(request: Request): string | null {
  const header = request.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.length > 0) {
    return header.split(',')[0].trim();
  }
  return request.ip ?? null;
}
