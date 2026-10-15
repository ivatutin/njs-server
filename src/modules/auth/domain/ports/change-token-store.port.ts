import { ContactChangeAlreadyPendingError } from '../errors/contact-change-already-pending.error';

export const CHANGE_TOKEN_STORE = Symbol('CHANGE_TOKEN_STORE');

/** TTL `changeToken`: 10 минут (ADR-0017 §5, ответ координатора №3). */
export const CHANGE_TOKEN_TTL_SECONDS = 600;

/** Лимит смен на пользователя за окно (ADR-0017 §7, I8) — защита от перебора «новых контактов». */
export const CHANGE_MAX_PER_USER_PER_DAY = 10;
export const CHANGE_USER_WINDOW_SECONDS = 86_400;

export type ContactChangeChannel = 'email' | 'phone';

/**
 * Состояние смены:
 * - `pending` — коды отправлены, смена не применена (в этом состоянии живёт и неудачная попытка
 *   с удачной компенсацией: по B2-1 `503` означает «ничего не применено, повтор разрешён»);
 * - `applied` — смена применена: повторный `verify` тем же токеном отвечает `200 UserDto` идемпотентно
 *   (запись живёт до TTL токена);
 * - `failed` — **компенсация не удалась** (инцидент/drift): повторный `verify` не применяет ничего,
 *   отдаёт `503`, а расхождение разбирается по алерту (drift-детектор — долг после Auth v1).
 */
export type ContactChangeStatus = 'pending' | 'applied' | 'failed';

export interface ContactChangeRecord {
  keycloakId: string;
  channel: ContactChangeChannel;
  /** Новое значение контакта (нормализованное). PII: в логи не пишем, живёт только TTL токена. */
  target: string;
  /** Контакт, на который ушёл второй код (старый или другой подтверждённый), если он нужен. */
  oldTarget: string | null;
  requiresOldChallenge: boolean;
  newChallengeId: string;
  oldChallengeId: string | null;
  status: ContactChangeStatus;
  /** Причина инцидента (заполняется только вместе со `status: 'failed'`). */
  failureReason?: string;
}

/** Решение по лимиту смен на пользователя. */
export type ContactChangeQuotaDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface CreateContactChangeParams {
  keycloakId: string;
  channel: ContactChangeChannel;
  target: string;
  oldTarget?: string | null;
  requiresOldChallenge: boolean;
  newChallengeId: string;
  oldChallengeId?: string | null;
}

/**
 * Хранилище `changeToken` (ADR-0017 §5): Redis, TTL 10 минут, значение токена хранится **хешем**,
 * запись привязана к `keycloakId`, токен **не одноразовый** (нужен и `verify`, и `cancel`),
 * активная смена у пользователя — одна.
 *
 * Целиком PII-безопасно: наружу (в ответы/логи) не уходит ни токен, ни контакт.
 */
export interface ChangeTokenStore {
  /**
   * Создаёт смену и занимает слот активной смены (`SET NX`): при уже начатой смене
   * бросает `ContactChangeAlreadyPendingError` — проверка и занятие слота атомарны.
   */
  create(params: CreateContactChangeParams): Promise<{ token: string; expiresAt: Date }>;

  /** Запись по токену (без проверки срока: истёкшие записи Redis уже удалил). */
  find(token: string): Promise<ContactChangeRecord | null>;

  /** Есть ли у пользователя активная смена (для `422 ContactChangeAlreadyPending` на `request`). */
  hasActive(keycloakId: string): Promise<boolean>;

  /** Помечает смену применённой и освобождает слот активной смены (запись живёт до TTL). */
  markApplied(token: string): Promise<void>;

  /** Инцидент (компенсация не удалась): статус `failed` + причина + освобождение слота активной смены. */
  markFailed(token: string, reason: string): Promise<void>;

  /** Снимает смену (`cancel`): удаляет и запись, и слот активной смены. */
  remove(token: string): Promise<void>;

  /** Лимит смен на пользователя за сутки (I8): вызывается на `request` до отправки кодов. */
  consumeUserQuota(keycloakId: string): Promise<ContactChangeQuotaDecision>;
}
