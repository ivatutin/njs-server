import { OtpChannel, OtpPurpose, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from '../otp-policy';
import { OtpExpiredError } from '../errors/otp-expired.error';
import { OtpTooManyAttemptsError } from '../errors/otp-too-many-attempts.error';

/** Сериализованное состояние челленджа (то, что лежит в Redis). */
export interface OtpChallengeSnapshot {
  id: string;
  channel: OtpChannel;
  target: string;
  purpose: OtpPurpose;
  codeHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
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
      target: params.target,
      purpose: params.purpose,
      codeHash: params.codeHash,
      attempts: 0,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    });
  }

  static restore(snapshot: OtpChallengeSnapshot): OtpChallenge {
    return new OtpChallenge({ ...snapshot });
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

  get codeHash(): string {
    return this.props.codeHash;
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

  toSnapshot(): OtpChallengeSnapshot {
    return { ...this.props };
  }
}
