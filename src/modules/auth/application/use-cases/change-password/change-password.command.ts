export class ChangePasswordCommand {
  constructor(
    /** `sub` из access-токена: пароль меняет владелец аккаунта. */
    public readonly keycloakId: string,
    public readonly newPassword: string,
  ) {}
}
