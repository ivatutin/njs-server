export class SignInPhoneCommand {
  constructor(
    public readonly phone: string,
    public readonly verificationToken: string,
  ) {}
}
