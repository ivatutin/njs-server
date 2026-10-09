import { OtpChannel, OtpPurpose } from '../../../domain/otp-policy';

export class SendOtpCommand {
  constructor(
    public readonly channel: OtpChannel,
    public readonly target: string,
    public readonly purpose: OtpPurpose,
    /** IP вызывающего — для per-IP лимита (в юнит-тестах может быть null). */
    public readonly ip: string | null = null,
  ) {}
}
