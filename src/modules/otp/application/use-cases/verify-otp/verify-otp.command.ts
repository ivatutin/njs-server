export class VerifyOtpCommand {
  constructor(
    public readonly challengeId: string,
    public readonly code: string,
  ) {}
}
