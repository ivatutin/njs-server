export class CreateUserCommand {
  constructor(
    public readonly keycloakId: string,
    public readonly email: string | null = null,
    public readonly phone: string | null = null,
    public readonly firstName: string | null = null,
    public readonly lastName: string | null = null,
    public readonly roles: string[] = [],
    public readonly metadata: Record<string, unknown> | null = null,
  ) {}
}
