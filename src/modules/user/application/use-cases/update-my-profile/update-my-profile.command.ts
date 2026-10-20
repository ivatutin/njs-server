export class UpdateMyProfileCommand {
  constructor(
    /** Keycloak id из токена (`sub`) — `PATCH /users/me/profile` работает только со своим профилем. */
    public readonly keycloakId: string,
    public readonly firstName?: string | null,
    public readonly lastName?: string | null,
  ) {}
}
