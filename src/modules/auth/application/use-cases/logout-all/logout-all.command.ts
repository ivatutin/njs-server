/** `POST /users/me/logout-all` (контракт v1.4, ADR-0018): выход со всех устройств. */
export class LogoutAllCommand {
  constructor(
    /** `sub` из access-токена = `keycloakId`. */
    public readonly keycloakId: string,
  ) {}
}
