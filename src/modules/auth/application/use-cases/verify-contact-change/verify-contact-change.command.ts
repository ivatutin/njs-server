/** `POST /users/me/contact-change/verify` (контракт v1.3). */
export class VerifyContactChangeCommand {
  constructor(
    public readonly keycloakId: string,
    public readonly changeToken: string,
    public readonly newCode: string,
    /** Обязателен, когда `request` вернул `requiresOldChallenge: true`. */
    public readonly oldCode?: string | null,
  ) {}
}
