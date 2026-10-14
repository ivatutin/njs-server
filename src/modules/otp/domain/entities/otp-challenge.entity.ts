import {
  CALL_POLL_MIN_SECONDS,
  CALL_WINDOW_SECONDS,
  CallStatus,
  OtpChannel,
  OtpPurpose,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  VerificationMethod,
  VERIFICATION_TOKEN_TTL_SECONDS,
} from '../otp-policy';
import { OtpExpiredError } from '../errors/otp-expired.error';
import { OtpTooManyAttemptsError } from '../errors/otp-too-many-attempts.error';

/** Сериализованное состояние челленджа (то, что лежит в Redis). */
export interface OtpChallengeSnapshot {
  id: string;
  channel: OtpChannel;
  /** Способ верификации: код по SMS или обратный звонок (ADR-0014). */
  method: VerificationMethod;
  target: string;
  purpose: OtpPurpose;
  /** Хеш кода; `null` у звонкового челленджа — кода у него нет. */
  codeHash: string | null;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  /** Звонковый канал: `check_id` провайдера и номер, на который надо звонить. */
  providerCheckId?: string;
  callTo?: string;
  /** Последнее известное состояние провайдера и момент опроса (троттлинг). */
  providerStatus?: CallStatus;
  providerCheckedAt?: string;
  /** Токен, выданный после подтверждения: повторный GET отдаёт тот же (ADR-0014). */
  verificationToken?: string;
  /** Причина терминального отказа (`status: 'failed'`). */
  failureReason?: string;
}

/**
 * OTP-челлендж — агрегат, отвечающий за правила: TTL и счётчик неверных попыток.
 * Хеш кода сравнивается снаружи (порт `OtpHasher`), сам код здесь не живёт.
 */
export class OtpChallenge {
  static readonly maxAttempts = OTP_MAX_ATTEMPTS;
  static readonly ttlSeconds = OTP_TTL_SECONDS;

  private constructor(private readonly props: OtpChallengeSnapshot) {}

  static create(params: {
    id: string;
    channel: OtpChannel;
    target: string;
    purpose: OtpPurpose;
    codeHash: string;
    ttlSeconds?: number;
    now?: Date;
  }): OtpChallenge {
    const now = params.now ?? new Date();
    const ttlSeconds = params.ttlSeconds ?? OtpChallenge.ttlSeconds;

    return new OtpChallenge({
      id: params.id,
      channel: params.channel,
      method: 'otp',
      target: params.target,
      purpose: params.purpose,
      codeHash: params.codeHash,
      attempts: 0,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    });
  }

  /**
   * Звонковый челлендж (ADR-0014): кода нет, вместо него `check_id` провайдера
   * и номер, на который пользователь должен позвонить. Окно — 5 минут
   * (ограничение провайдера), попытки не считаются: подтверждение приходит
   * от провайдера, а не из ввода пользователя.
   */
  static createCall(params: {
    id: string;
    channel: OtpChannel;
    target: string;
    purpose: OtpPurpose;
    providerCheckId: string;
    callTo: string;
    ttlSeconds?: number;
    now?: Date;
  }): OtpChallenge {
    const now = params.now ?? new Date();
    const ttlSeconds = params.ttlSeconds ?? CALL_WINDOW_SECONDS;

    return new OtpChallenge({
      id: params.id,
      channel: params.channel,
      method: 'call',
      target: params.target,
      purpose: params.purpose,
      codeHash: null,
      attempts: 0,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      providerCheckId: params.providerCheckId,
      callTo: params.callTo,
      providerStatus: 'pending',
    });
  }

  /** Снапшоты, записанные до v1.2, не содержат `method` — считаем их OTP-каналом. */
  static restore(snapshot: OtpChallengeSnapshot): OtpChallenge {
    return new OtpChallenge({ ...snapshot, method: snapshot.method ?? 'otp' });
  }

  get id(): string {
    return this.props.id;
  }

  get channel(): OtpChannel {
    return this.props.channel;
  }

  get target(): string {
    return this.props.target;
  }

  get purpose(): OtpPurpose {
    return this.props.purpose;
  }

  get method(): VerificationMethod {
    return this.props.method;
  }

  /** `null` у звонкового челленджа: кода нет, сравнивать нечего. */
  get codeHash(): string | null {
    return this.props.codeHash;
  }

  get providerCheckId(): string | undefined {
    return this.props.providerCheckId;
  }

  get callTo(): string | undefined {
    return this.props.callTo;
  }

  get providerStatus(): CallStatus | undefined {
    return this.props.providerStatus;
  }

  get verificationToken(): string | undefined {
    return this.props.verificationToken;
  }

  get failureReason(): string | undefined {
    return this.props.failureReason;
  }

  get attempts(): number {
    return this.props.attempts;
  }

  get expiresAt(): Date {
    return new Date(this.props.expiresAt);
  }

  isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  isLocked(): boolean {
    return this.props.attempts >= OtpChallenge.maxAttempts;
  }

  /** Бросает, если челлендж уже непригоден (просрочен или залочен). */
  ensureUsable(now: Date = new Date()): void {
    if (this.isExpired(now)) throw new OtpExpiredError();
    if (this.isLocked()) throw new OtpTooManyAttemptsError();
  }

  /**
   * Регистрирует неверный ввод. После `maxAttempts` попыток челлендж считается
   * залоченным и дальше непригоден — пользователю нужен resend.
   */
  registerFailedAttempt(): void {
    this.props.attempts += 1;
    if (this.isLocked()) throw new OtpTooManyAttemptsError();
  }

  /** Сколько попыток осталось до лока (для UX/логов). */
  get remainingAttempts(): number {
    return Math.max(0, OtpChallenge.maxAttempts - this.props.attempts);
  }

  /**
   * Пора ли снова спросить провайдера: не чаще `CALL_POLL_MIN_SECONDS`,
   * чтобы фронтовый polling не превращался в поток запросов к SMS.ru.
   */
  shouldPollProvider(now: Date = new Date()): boolean {
    if (!this.props.providerCheckedAt) return true;
    const elapsed = now.getTime() - new Date(this.props.providerCheckedAt).getTime();
    return elapsed >= CALL_POLL_MIN_SECONDS * 1000;
  }

  /** Фиксирует ответ провайдера, не меняя терминального состояния. */
  recordProviderCheck(status: CallStatus, now: Date = new Date()): void {
    this.props.providerStatus = status;
    this.props.providerCheckedAt = now.toISOString();
  }

  /**
   * Подтверждение звонка: сохраняем выданный токен (повторный GET отдаёт тот же)
   * и продлеваем жизнь челленджа до TTL токена — иначе подтверждение, случившееся
   * на 299-й секунде окна, «исчезло» бы раньше, чем фронт успел его забрать.
   */
  markVerified(token: string, now: Date = new Date()): void {
    this.props.verificationToken = token;
    this.props.providerStatus = 'verified';
    this.props.providerCheckedAt = now.toISOString();
    this.props.expiresAt = new Date(
      now.getTime() + VERIFICATION_TOKEN_TTL_SECONDS * 1000,
    ).toISOString();
  }

  /** Терминальный отказ (например, провайдер не смог принять номер). */
  markFailed(reason: string, now: Date = new Date()): void {
    this.props.failureReason = reason;
    this.props.providerStatus = 'failed';
    this.props.providerCheckedAt = now.toISOString();
  }

  isVerified(): boolean {
    return this.props.verificationToken !== undefined;
  }

  toSnapshot(): OtpChallengeSnapshot {
    return { ...this.props };
  }
}
