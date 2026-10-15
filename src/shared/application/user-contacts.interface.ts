/**
 * Порт «санкционированная смена контакта» (ADR-0017 ред. 2).
 *
 * Владелец данных — user-контекст (там живёт инвариант «verified-контакт напрямую не меняется»),
 * поэтому порт в shared kernel, а реализацию поставляет user-модуль. Auth-контекст вызывает его
 * из flow'а `contact-change/verify` после проверки кодов.
 */
export const USER_CONTACTS = Symbol('USER_CONTACTS');

/** Снимок пользователя после смены — из него auth-контекст собирает контрактный `UserDto`. */
export interface UserContactsSnapshot {
  id: string;
  keycloakId: string;
  email: string | null;
  phone: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserContacts {
  /** Текущее состояние контактов (для `request`: какой контакт заменяем и подтверждён ли он). */
  find(keycloakId: string): Promise<UserContactsSnapshot | null>;

  /**
   * Занят ли контакт кем-то (ранний `409` на `request`, до отправки кодов). Финальная проверка
   * всё равно идёт внутри транзакции `applyVerifiedChange` — здесь только UX.
   */
  isContactTaken(params: { email?: string | null; phone?: string | null }): Promise<boolean>;

  /**
   * Компенсация частичного сбоя (ADR-0017 §3): возвращает контакты к снимку «до» вместе с метками
   * подтверждения. Это **repair**-путь, а не доменная операция, поэтому вызывается только flow'ом
   * `contact-change` при исчерпании ретраев к Keycloak.
   */
  rollback(params: {
    keycloakId: string;
    email: string | null;
    phone: string | null;
    emailVerifiedAt: string | null;
    phoneVerifiedAt: string | null;
  }): Promise<void>;

  /**
   * Заменяет контакт, подтверждённый кодами: ровно один канал (`email` **или** `phone`),
   * нормализация — на стороне user-контекста (email → lowercase, телефон → E.164).
   *
   * Внутри одной транзакции: ре-чек занятости (закрывает гонку между `request` и `verify`),
   * запись нового контакта как подтверждённого и `activateIfPending()`. Идемпотентно по конечному
   * состоянию — повтор с тем же значением ничего не меняет (нужно для ретраев `verify`).
   *
   * Ошибки: `UserNotFound` (404), `ContactAlreadyExists` (409 — контакт занят, включая гонку).
   */
  applyVerifiedChange(params: {
    keycloakId: string;
    email?: string | null;
    phone?: string | null;
  }): Promise<UserContactsSnapshot>;
}
