/** Запрос, который Keycloak присылает на наш «канал аутентификации» (ADR-0015). */
export class HandleCibaChannelRequestCommand {
  constructor(
    public readonly authorizationHeader: string | null,
    public readonly loginHint: string | null,
    public readonly bindingMessage: string | null,
  ) {}
}
