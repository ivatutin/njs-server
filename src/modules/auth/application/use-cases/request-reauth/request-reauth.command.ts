export class RequestReauthCommand {
  constructor(
    /** `sub` из access-токена: пользователь, который подтверждает пароль. */
    public readonly keycloakId: string,
    public readonly password: string,
  ) {}
}
