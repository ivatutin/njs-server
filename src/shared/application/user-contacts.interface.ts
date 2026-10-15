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
