export class SignUpEmailCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly acceptedTerms: boolean,
    public readonly firstName: string | null = null,
    public readonly lastName: string | null = null,
  ) {}
}
