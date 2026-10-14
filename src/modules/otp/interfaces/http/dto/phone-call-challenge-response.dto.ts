/** Ответ `POST /auth/phone/call` (контракт v1.2). */
export class PhoneCallChallengeResponseDto {
  challengeId: string;
  channel: 'phone';
  /** Отличает звонковый челлендж от OTP-челленджа. */
  method: 'call';
  /** Номер, на который должен позвонить пользователь (общий сервисный). */
  callTo: string;
  expiresAt: string;
  cooldownSeconds: number;
  /** SMS-код остаётся доступен тем же номером (`POST /auth/otp/send`). */
  otpFallback: true;
}
