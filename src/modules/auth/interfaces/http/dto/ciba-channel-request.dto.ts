import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/**
 * Тело уведомления Keycloak на наш канал аутентификации CIBA (ADR-0015).
 * Формат зафиксирован живьём: `scope`, `binding_message`, `login_hint`,
 * `is_consent_required` (+ `acr_values` при запросе). Поля читаем толерантно:
 * лишние игнорируем, отсутствие `binding_message` = отказ.
 */
const CibaChannelRequestSchema = z
  .object({
    login_hint: z.string().optional(),
    binding_message: z.string().optional(),
    is_consent_required: z.boolean().optional(),
    scope: z.string().optional(),
  })
  .passthrough();

export class CibaChannelRequestDto extends createZodDto(CibaChannelRequestSchema) {}
