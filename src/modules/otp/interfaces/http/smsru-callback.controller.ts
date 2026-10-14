import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@shared/interfaces/http/decorators/public.decorator';
import { RefreshPhoneCallStatusCommand } from '../../application/use-cases/refresh-phone-call-status/refresh-phone-call-status.command';
import { RefreshPhoneCallStatusUseCase } from '../../application/use-cases/refresh-phone-call-status/refresh-phone-call-status.use-case';

/** Сколько строк из тела вебхука проверяем максимум (защита от мусорного payload). */
const MAX_CANDIDATES = 20;

/**
 * Вебхук провайдера подтверждения звонком (SMS.ru callback, ADR-0014).
 *
 * Телу запроса **не доверяем**: оно не подписано и его формат провайдер публично
 * не документирует. Тело используется только как подсказка, *какую* из наших заявок
 * перепроверить (`check_id` ищется по обратному индексу Redis), а состояние всегда
 * берётся из авторизованного `callcheck/status`.
 *
 * Ответ всегда 200: провайдеру нечего повторять, неподтверждённые заявки догоняет
 * polling-эндпоинт фронта.
 */
@ApiExcludeController()
@Controller('callbacks/smsru')
export class SmsruCallbackController {
  private readonly logger = new Logger(SmsruCallbackController.name);

  constructor(private readonly refreshUC: RefreshPhoneCallStatusUseCase) {}

  @Public()
  @Post()
  @HttpCode(200)
  async handle(@Body() body: unknown): Promise<{ ok: true }> {
    const candidates = collectStringValues(body);
    this.logger.log(
      `callback received: keys=[${topLevelKeys(body).join(',')}] candidates=${candidates.length}`,
    );

    let applied = 0;
    for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
      const matched = await this.refreshUC.execute(new RefreshPhoneCallStatusCommand(candidate));
      if (matched) applied += 1;
    }

    this.logger.log(`callback processed: matched=${applied}`);
    return { ok: true };
  }
}

/** Все строковые значения тела (рекурсивно) — формат payload заранее не известен. */
function collectStringValues(value: unknown, acc: Set<string> = new Set()): string[] {
  if (typeof value === 'string') {
    acc.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, acc);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectStringValues(item, acc);
  }
  return [...acc];
}

/** Только ключи верхнего уровня — тело может содержать телефон (PII), его не логируем. */
function topLevelKeys(body: unknown): string[] {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body);
}
