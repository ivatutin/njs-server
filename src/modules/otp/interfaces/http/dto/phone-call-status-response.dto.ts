import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CALL_STATUSES } from '../../../domain/otp-policy';

/**
 * Ответ `GET /auth/phone/call/:challengeId` (контракт v1.2): **всегда 200**, а
 * терминальные состояния выражаются полем `status`, а не кодами ошибок.
 */
export const PhoneCallStatusResponseSchema = z.object({
  challengeId: z.string(),
  /** Список состояний берём из `CALL_STATUSES`, чтобы не расходиться с доменом. */
  status: z.enum(CALL_STATUSES),
  /** Только при `status: 'verified'`; повторный запрос отдаёт тот же токен. */
  verificationToken: z.string().optional(),
  /** Только при `status: 'failed'`. */
  reason: z.string().optional(),
});

export class PhoneCallStatusResponseDto extends createZodDto(PhoneCallStatusResponseSchema) {}
