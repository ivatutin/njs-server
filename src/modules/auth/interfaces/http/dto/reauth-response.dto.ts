/** Ответ `POST /auth/reauth`: одноразовый токен на ~5 минут. */
export class ReauthResponseDto {
  reauthToken: string;
  /** ISO-строка. */
  expiresAt: string;
}
