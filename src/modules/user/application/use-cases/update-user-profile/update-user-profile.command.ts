export class UpdateUserProfileCommand {
  constructor(
    public readonly userId: string,
    public readonly firstName?: string | null,
    public readonly lastName?: string | null,
  ) {}
}
