import { OtpChannel, OtpPurpose } from '../../../domain/otp-policy';

export class StartPhoneCallCommand {
  constructor(
    public readonly channel: OtpChannel,
    /** Номер в E.164 — поле `phone` контракта, в домене это `target`. */
    public readonly target: string,
    public readonly purpose: OtpPurpose,
    /** IP вызывающего: провайдеру передаём именно его, а не адрес сервера. */
    public readonly ip: string | null = null,
  ) {}
}
