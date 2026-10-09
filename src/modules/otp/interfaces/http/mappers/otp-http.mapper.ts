import { OtpChallengeResult } from '../../../application/use-cases/send-otp/send-otp.use-case';
import { OtpVerificationResult } from '../../../application/use-cases/verify-otp/verify-otp.use-case';
import { OtpChallengeResponseDto } from '../dto/otp-challenge-response.dto';
import { OtpVerifiedResponseDto } from '../dto/otp-verified-response.dto';

/**
 * DTO ≠ результат use case: наружу отдаём только поля контракта
 * (в частности, никогда — codeHash/target в plaintext).
 */
export class OtpHttpMapper {
  static toChallengeResponse(result: OtpChallengeResult): OtpChallengeResponseDto {
    return {
      challengeId: result.challengeId,
      channel: result.channel,
      target: result.target,
      expiresAt: result.expiresAt,
      cooldownSeconds: result.cooldownSeconds,
      codeLength: result.codeLength,
    };
  }

  static toVerifiedResponse(result: OtpVerificationResult): OtpVerifiedResponseDto {
    return {
      challengeId: result.challengeId,
      verified: true,
      verificationToken: result.verificationToken,
    };
  }
}
