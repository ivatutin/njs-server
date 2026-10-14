import { PhoneCallChallengeResult } from '../../../application/use-cases/start-phone-call/start-phone-call.use-case';
import { PhoneCallStatusResult } from '../../../application/use-cases/get-phone-call-status/get-phone-call-status.use-case';
import { PhoneCallChallengeResponseDto } from '../dto/phone-call-challenge-response.dto';
import { PhoneCallStatusResponseDto } from '../dto/phone-call-status-response.dto';

/**
 * DTO ≠ результат use case: наружу отдаём только поля контракта
 * (в частности, никогда — `check_id` провайдера и телефон в plaintext).
 */
export class PhoneCallHttpMapper {
  static toChallengeResponse(result: PhoneCallChallengeResult): PhoneCallChallengeResponseDto {
    return {
      challengeId: result.challengeId,
      channel: result.channel,
      method: result.method,
      callTo: result.callTo,
      expiresAt: result.expiresAt,
      cooldownSeconds: result.cooldownSeconds,
      otpFallback: result.otpFallback,
    };
  }

  static toStatusResponse(result: PhoneCallStatusResult): PhoneCallStatusResponseDto {
    return {
      challengeId: result.challengeId,
      status: result.status,
      ...(result.verificationToken ? { verificationToken: result.verificationToken } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }
}
