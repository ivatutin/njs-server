/** Ответ `POST /auth/otp/verify` (контракт v1.0). */
export class OtpVerifiedResponseDto {
  challengeId: string;
  verified: true;
  verificationToken: string;
}
