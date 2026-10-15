export class SetPasswordCommand {
  constructor(
    /** `sub` из access-токена: пароль задаёт сам пользователь. */
    public readonly keycloakId: string,
    public readonly verificationToken: string,
    public readonly newPassword: string,
  ) {}
}
