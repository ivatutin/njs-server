import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RequestContactChangeResult } from '../../../application/use-cases/request-contact-change/request-contact-change.use-case';

/** Ответ `POST /users/me/contact-change/request` (контракт v1.3): 201. */
export const RequestContactChangeResponseSchema = z.object({
  changeToken: z.string(),
  requiresOldChallenge: z.boolean(),
  oldChallengeId: z.string().nullable(),
  newChallengeId: z.string(),
});

export class RequestContactChangeResponseDto extends createZodDto(
  RequestContactChangeResponseSchema,
) {}

/** Маппер ответа `request` (класс-обёртка, чтобы контракт был в одном месте). */
export function toRequestContactChangeResponse(
  result: RequestContactChangeResult,
): RequestContactChangeResponseDto {
  return {
    changeToken: result.changeToken,
    requiresOldChallenge: result.requiresOldChallenge,
    oldChallengeId: result.oldChallengeId,
    newChallengeId: result.newChallengeId,
  };
}
