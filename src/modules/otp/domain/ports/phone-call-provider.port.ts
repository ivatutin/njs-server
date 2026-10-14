import { CallStatus } from '../otp-policy';

export const PHONE_CALL_PROVIDER = Symbol('PHONE_CALL_PROVIDER');

/** Данные заявки у провайдера, полученные на старте. */
export interface PhoneCallStart {
  /** `check_id` провайдера: по нему коррелируем вебхук и опрос состояния. */
  providerCheckId: string;
  /** Номер, на который должен позвонить пользователь (в «красивом» виде). */
  callTo: string;
}

/**
 * Провайдер подтверждения номера обратным звонком (SMS.ru callcheck, ADR-0014).
 *
 * Порт deliberately узкий: домен знает только «инициировать заявку» и «спросить
 * состояние». Форматы провайдера (`check_id`, коды 400/401/402) остаются внутри
 * адаптера — так же, как `SmsSender` скрывает транспорт SMS.
 */
export interface PhoneCallProvider {
  /**
   * Инициирует заявку у провайдера.
   * `null` — провайдер недоступен или выключен: контроллер отдаёт 503 без нового
   * кода контракта, челлендж при этом не создаётся.
   */
  start(params: { phone: string; userIp?: string | null }): Promise<PhoneCallStart | null>;

  /** Текущее состояние заявки по `check_id` провайдера. */
  status(providerCheckId: string): Promise<CallStatus>;
}
