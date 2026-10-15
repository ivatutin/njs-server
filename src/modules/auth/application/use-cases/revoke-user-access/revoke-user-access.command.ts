/** Причина отзыва доступа — только для логов/наблюдаемости (ADR-0018). */
export type RevokeReason =
  | 'contact-change'
  | 'password-change'
  | 'admin-suspend'
  | 'admin-delete'
  | 'logout-everywhere';

export class RevokeUserAccessCommand {
  constructor(
    /** `sub` из access-токена = `keycloakId`. */
    public readonly keycloakId: string,
    public readonly reason: RevokeReason,
  ) {}
}
