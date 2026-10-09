/**
 * Порт «существует ли пользователь с таким телефоном».
 *
 * Нужен OTP-контексту: 409 `ContactAlreadyExists` на `purpose = 'sign-up'` и
 * anti-enumeration для `purpose = 'sign-in'` (не отправлять SMS неизвестному номеру).
 * Владелец данных — user-контекст, поэтому порт живёт в shared kernel
 * (как `EVENT_BUS`), а реализацию поставляет user-модуль: прямых импортов
 * между модулями нет.
 */
export const CONTACT_LOOKUP = Symbol('CONTACT_LOOKUP');

export interface ContactLookup {
  /** @param phone телефон в формате E.164 */
  existsByPhone(phone: string): Promise<boolean>;
}
