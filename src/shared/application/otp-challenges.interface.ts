/**
 * Порт «OTP-челлендж для внутренних сценариев» (ADR-0017 ред. 2).
 *
 * Нужен auth-контексту для смены контакта: он запускает челлендж на новый контакт (и, когда
 * требуется, на старый) и сам проверяет **два** кода, завершая операцию. Публичный API
 * `/auth/otp/*` для этого не годится: он выдаёт `verificationToken` под свои сценарии.
 *
 * Владелец челленджей — OTP-контекст, поэтому порт живёт в shared kernel, а реализацию
 * поставляет otp-модуль: импортов «модуль → модуль» нет.
 */
export const OTP_CHALLENGES = Symbol('OTP_CHALLENGES');

export interface OtpChallengeStart {
  challengeId: string;
  /** ISO-строка (как в контракте). */
  expiresAt: string;
}

export interface OtpChallenges {
  /**
   * Запуск челленджа: код уходит по каналу контакта (SMS/письмо), наружу — только id и срок.
   *
   * @param purpose значение из `OTP_PURPOSES` OTP-контекста (`change-contact-new`,
   *                `change-contact-old`); реализация валидирует его и падает на неизвестном
   *                (это ошибка вызова внутри нашего кода, а не пользовательский ввод).
   * @param ip IP пользователя для лимитов, если известен.
   *
   * Ошибки: `OtpRateLimited` (лимиты per-target/per-IP) и `503` — если канал доставки недоступен
   * (например, в проде не сконфигурирован email-провайдер). Вызывающая сторона в этом случае
   * ничего не применяет.
   */
  start(params: {
    channel: 'email' | 'phone';
    target: string;
    purpose: string;
    ip?: string | null;
  }): Promise<OtpChallengeStart>;

  /**
   * Проверка кода **по паре (target, purpose)**: перевыпуск челленджа на том же контакте
   * не ломает уже начатую операцию (в отличие от проверки по `challengeId`).
   *
   * Ошибки: `OtpInvalid`, `OtpExpired`, `OtpTooManyAttempts`.
   */
  verify(params: { target: string; purpose: string; code: string }): Promise<void>;
}
