import { CallStatus } from '../../../domain/otp-policy';

/**
 * Ответ `GET /auth/phone/call/:challengeId` (контракт v1.2): **всегда 200**, а
 * терминальные состояния выражаются полем `status`, а не кодами ошибок.
 */
export class PhoneCallStatusResponseDto {
  challengeId: string;
  status: CallStatus;
  /** Только при `status: 'verified'`; повторный запрос отдаёт тот же токен. */
  verificationToken?: string;
  /** Только при `status: 'failed'`. */
  reason?: string;
}
