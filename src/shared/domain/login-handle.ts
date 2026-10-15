import { randomBytes } from 'node:crypto';

/**
 * Префикс логина: сразу видно, что это наш технический handle, а не контакт.
 */
const LOGIN_HANDLE_PREFIX = 'usr_';
const LOGIN_HANDLE_BYTES = 8;

/**
 * Стабильный login-handle (ADR-0017 ред.2, путь B).
 *
 * Свойства, на которые опирается политика:
 * - **не PII** — генерируется случайно, не содержит телефона/email (не «уезжает» в `login_hint` и в аудит);
 * - **неизменяем** — не связан с контактом, поэтому смена контакта не требует переименования в Keycloak
 *   (переименование в реалме запрещено: `editUsernameAllowed=false`);
 * - **уникален** — гарантируется уникальным индексом в БД (`User.handle`), 64 бита энтропии;
 * - **резолвится** обратно в пользователя локально, без вызова admin-API.
 *
 * Формат: `usr_<16 hex>`.
 */
export function generateLoginHandle(): string {
  return `${LOGIN_HANDLE_PREFIX}${randomBytes(LOGIN_HANDLE_BYTES).toString('hex')}`;
}
