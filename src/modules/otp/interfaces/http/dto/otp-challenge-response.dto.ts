/** Ответ `POST /auth/otp/send` (контракт v1.0). `target` — замаскированный. */
export class OtpChallengeResponseDto {
  challengeId: string;
  channel: 'phone';
  target: string;
  expiresAt: string;
  cooldownSeconds: number;
  codeLength: number;
}
