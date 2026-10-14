import { TokenPair } from './identity-provider.port';

export const USER_TOKEN_ISSUER = Symbol('USER_TOKEN_ISSUER');

/** Начатая backchannel-заявка (CIBA, ADR-0015). */
export interface BackchannelAuthStart {
  authReqId: string;
  /** Минимальный интервал опроса, который вернул Keycloak (по умолчанию 5 с). */
  intervalSeconds: number;
}

/** Решение нашего «канала аутентификации» по заявке. */
export type ChannelDecision = 'SUCCEED' | 'UNAUTHORIZED' | 'CANCELLED';

/**
 * Выдача токенов конкретному пользователю **без пароля и без браузера** (ADR-0015).
 *
 * 1. `startBackchannelAuth` — наш бэкенд заказывает заявку;
 * 2. Keycloak дёргает наш канал → `verifyChannelToken`;
 * 3. `completeBackchannelAuth` — канал сообщает решение;
 * 4. `exchangeBackchannelAuth` — забираем `TokenPair`.
 *
 * Порт отделён от `IdentityProviderPort` (пароль/refresh) и `IdentityAdminPort`
 * (управление учётками): здесь — выдача токенов пользователю по решению нашего
 * же сервиса.
 */
export interface UserTokenIssuer {
  startBackchannelAuth(params: {
    /** `login_hint`: Keycloak 26 резолвит только username или email. */
    loginHint: string;
    /** Наш корреляционный идентификатор (возвращается в уведомлении канала). */
    bindingMessage: string;
  }): Promise<BackchannelAuthStart>;

  /**
   * Опрос токенов. Первый запрос — не раньше `intervalSeconds` от заявки:
   * Keycloak отвечает `400 slow_down / too early to access`, если опрашивать
   * чаще (RFC: на `slow_down` интервал увеличивается ещё на 5 с).
   */
  exchangeBackchannelAuth(authReqId: string, intervalSeconds: number): Promise<TokenPair>;

  /** Проверяет Bearer из уведомления канала и возвращает identity-пользователя. */
  verifyChannelToken(authorizationHeader: string | null): Promise<{ userId: string }>;

  /** Сообщает Keycloak решение по заявке — тем же Bearer-токеном. */
  completeBackchannelAuth(params: {
    authorizationHeader: string;
    decision: ChannelDecision;
  }): Promise<void>;
}
