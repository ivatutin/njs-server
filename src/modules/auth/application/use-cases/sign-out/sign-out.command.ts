export class SignOutCommand {
  constructor(
    public readonly accessToken: string | null,
    public readonly refreshToken: string,
  ) {}
}
