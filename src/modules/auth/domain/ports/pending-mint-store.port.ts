export const PENDING_MINT_STORE = Symbol('PENDING_MINT_STORE');

/**
 * Заявка на выдачу токенов, ожидающая подтверждения нашего канала (ADR-0015).
 * Ключ — наш `binding_message`: именно он возвращается в уведомлении Keycloak,
 * поэтому по нему безопасно связывать уведомление с начатой заявкой.
 */
export interface PendingMint {
  loginHint: string;
  /** Identity-пользователь, для которого заказаны токены (сверяем с `sub` уведомления). */
  keycloakId: string;
  purpose: string;
  phone: string | null;
}

export interface PendingMintStore {
  /** TTL — окно CIBA (`cibaExpiresIn`, 120 с) плюс запас. */
  save(bindingMessage: string, mint: PendingMint): Promise<void>;

  /** Одноразовое чтение: заявка расходуется при первом обращении канала. */
  consume(bindingMessage: string): Promise<PendingMint | null>;
}
