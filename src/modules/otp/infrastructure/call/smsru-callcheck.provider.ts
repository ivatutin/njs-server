import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CallStatus } from '../../domain/otp-policy';
import { PhoneCallProvider, PhoneCallStart } from '../../domain/ports/phone-call-provider.port';

interface CallcheckAddResponse {
  status?: string;
  status_code?: number | string;
  status_text?: string;
  check_id?: string;
  call_phone?: string;
  call_phone_pretty?: string;
}

interface CallcheckStatusResponse {
  status?: string;
  status_code?: number | string;
  status_text?: string;
  check_status?: number | string;
  check_status_text?: string;
}

/** Коды `check_status` SMS.ru (не путать с HTTP-семантикой: 401 = подтверждён). */
const CHECK_STATUS_PENDING = '400';
const CHECK_STATUS_VERIFIED = '401';
const CHECK_STATUS_EXPIRED = '402';

/** Request-level коды, которые встретились до создания/поиска заявки. */
const STATUS_CODE_INVALID_PHONE = 202;
const STATUS_CODE_EXPIRED = 402;

/**
 * Боевой провайдер подтверждения номера обратным звонком — SMS.ru callcheck
 * (`https://sms.ru/callcheck/{add,status}`, ADR-0014).
 *
 * Всё, что знает о формате провайдера, живёт здесь: домен получает только
 * `providerCheckId` + `callTo` и одно из состояний `pending|verified|expired|failed`.
 * Запросы — POST с `api_id` (секрет не логируется).
 */
@Injectable()
export class SmsRuCallcheckProvider implements PhoneCallProvider {
  private static readonly TIMEOUT_MS = 5_000;

  private readonly logger = new Logger(SmsRuCallcheckProvider.name);
  private readonly apiId: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiId = config.get<string>('smsru.apiId') ?? '';
    this.baseUrl = config.get<string>('smsru.baseUrl') ?? 'https://sms.ru';
  }

  async start(params: { phone: string; userIp?: string | null }): Promise<PhoneCallStart | null> {
    if (!this.apiId) {
      this.logger.error('SMSRU_API_ID is not configured — call verification is unavailable');
      return null;
    }

    const body = new URLSearchParams({
      api_id: this.apiId,
      phone: toProviderPhone(params.phone),
      json: '1',
    });
    // IP пользователя (не сервера): провайдер по нему выбирает номер, доступный
    // из роуминга, и сохраняет его в заявке для разбора спорных ситуаций.
    if (params.userIp) body.set('ip', params.userIp);

    try {
      const { data } = await axios.post<CallcheckAddResponse>(
        `${this.baseUrl}/callcheck/add`,
        body,
        { timeout: SmsRuCallcheckProvider.TIMEOUT_MS },
      );
      if (data.status !== 'OK' || !data.check_id) {
        // 202 (номер указан неверно) и прочие отказы старта не выражаются формой
        // ответа контракта → отдаём 503 без нового кода (ADR-0014).
        this.logger.warn(
          `callcheck/add rejected: status_code=${data.status_code ?? 'n/a'} ${data.status_text ?? ''}`,
        );
        return null;
      }
      return {
        providerCheckId: data.check_id,
        callTo: data.call_phone_pretty ?? data.call_phone ?? '',
      };
    } catch (cause) {
      this.logger.error(`callcheck/add failed: ${describe(cause)}`);
      return null;
    }
  }

  async status(providerCheckId: string): Promise<CallStatus> {
    const body = new URLSearchParams({
      api_id: this.apiId,
      check_id: providerCheckId,
      json: '1',
    });

    // Сетевые сбои и 5xx пробрасываем: вызывающая сторона решает, что показать
    // (для polling это «оставить последнее известное состояние»).
    const { data } = await axios.post<CallcheckStatusResponse>(
      `${this.baseUrl}/callcheck/status`,
      body,
      { timeout: SmsRuCallcheckProvider.TIMEOUT_MS },
    );

    const checkStatus = data.check_status === undefined ? undefined : String(data.check_status);
    if (data.status === 'OK' && checkStatus !== undefined) {
      return fromCheckStatus(checkStatus);
    }

    const statusCode = Number(data.status_code);
    if (statusCode === STATUS_CODE_EXPIRED) return 'expired';
    if (statusCode === STATUS_CODE_INVALID_PHONE) return 'failed';

    // Неожиданный ответ (включая 301 «неверный api_id» — это ошибка конфигурации).
    throw new Error(
      `callcheck/status unexpected response: status_code=${data.status_code ?? 'n/a'} ${data.status_text ?? ''}`,
    );
  }
}

function fromCheckStatus(checkStatus: string): CallStatus {
  if (checkStatus === CHECK_STATUS_VERIFIED) return 'verified';
  if (checkStatus === CHECK_STATUS_EXPIRED) return 'expired';
  if (checkStatus === CHECK_STATUS_PENDING) return 'pending';
  return 'pending';
}

/** SMS.ru ждёт номер без `+`: `79255070602`. */
function toProviderPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
