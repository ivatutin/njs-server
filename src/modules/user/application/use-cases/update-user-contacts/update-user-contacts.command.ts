export class UpdateUserContactsCommand {
  constructor(
    public readonly userId: string,
    public readonly email?: string | null,
    public readonly phone?: string | null,
  ) {}
}
