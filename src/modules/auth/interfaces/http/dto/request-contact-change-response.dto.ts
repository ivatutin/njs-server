import { RequestContactChangeResult } from '../../../application/use-cases/request-contact-change/request-contact-change.use-case';

/** Ответ `POST /users/me/contact-change/request` (контракт v1.3): 201. */
export class RequestContactChangeResponseDto {
  changeToken: string;
  requiresOldChallenge: boolean;
  oldChallengeId: string | null;
  newChallengeId: string;
}

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
