/** `POST /users/me/contact-change/request` (контракт v1.3). */
export class RequestContactChangeCommand {
  constructor(
    public readonly keycloakId: string,
    public readonly channel: 'email' | 'phone',
    public readonly newValue: string,
    public readonly ip?: string | null,
  ) {}
}
