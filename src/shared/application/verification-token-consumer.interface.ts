/**
 * Порт «предъяви verificationToken и скажи, что он подтверждает».
 *
 * Нужен auth-контексту (Phase 2: `sign-up/phone`, `sign-in/phone`; Phase 4:
 * `set-password`), а владелец токена — OTP-контекст. Порт живёт в shared kernel
 * (как `EVENT_BUS` / `CONTACT_LOOKUP`), реализацию поставляет OTP-модуль:
 * прямых импортов между модулями нет.
 *
 * Токен выдаётся после успешной верификации телефона (ADR-0011/ADR-0014) и
 * одноразовый: чтение удаляет его.
 */
export const VERIFICATION_TOKEN_CONSUMER = Symbol('VERIFICATION_TOKEN_CONSUMER');

/** Что подтверждено токеном. `purpose` — строка контракта (`sign-up`, `sign-in`, …). */
export interface ConsumedVerificationToken {
  /** Контакт, владение которым подтверждено (E.164 для телефона). */
  target: string;
  purpose: string;
}

export interface VerificationTokenConsumer {
  /** `null` — токена нет, он уже использован или истёк. */
  consume(token: string): Promise<ConsumedVerificationToken | null>;
}
