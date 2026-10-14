export class SignUpPhoneCommand {
  constructor(
    public readonly phone: string,
    public readonly verificationToken: string,
    public readonly acceptedTerms: boolean,
    public readonly firstName: string | null = null,
    public readonly lastName: string | null = null,
  ) {}
}
