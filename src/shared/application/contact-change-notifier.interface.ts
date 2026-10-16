/**
 * Порт «уведомить о смене контакта» (ADR-0017 §6, I1).
 *
 * Дешёвый контроль против незаметного угона аккаунта: после успешной смены сообщение уходит
 * **и на новый, и на прежний** контакт. Best-effort: смена уже применена, поэтому падение
 * доставки не должно превращать успех в ошибку — вызывающий глушит и логирует.
 *
 * Владелец каналов доставки — OTP-контекст (SMS/email), поэтому реализацию поставляет он,
 * а порт живёт в shared kernel: auth-контекст не импортирует чужие модули.
 */
export const CONTACT_CHANGE_NOTIFIER = Symbol('CONTACT_CHANGE_NOTIFIER');

export interface ContactChangeNotifier {
  /**
   * @param channel канал, по которому сменился контакт;
   * @param newValue новое значение (нормализованное);
   * @param oldValue прежнее значение того же канала или `null`, если контакта не было.
   */
  notifyChanged(params: {
    keycloakId: string;
    channel: 'email' | 'phone';
    newValue: string;
    oldValue: string | null;
  }): Promise<void>;
}
