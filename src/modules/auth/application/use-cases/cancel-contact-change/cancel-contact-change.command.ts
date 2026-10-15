/** `POST /users/me/contact-change/cancel` (контракт v1.3). */
export class CancelContactChangeCommand {
  constructor(
    public readonly keycloakId: string,
    public readonly changeToken: string,
  ) {}
}
