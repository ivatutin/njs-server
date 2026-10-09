import { randomInt } from 'node:crypto';
import { OTP_CODE_LENGTH } from './otp-policy';

/**
 * Генерирует цифровой код (по умолчанию 6 цифр) криптостойким источником
 * (`crypto.randomInt` — CSPRNG, без модульного смещения).
 * Ведущие нули сохраняются: возвращается строка.
 */
export function generateOtpCode(length: number = OTP_CODE_LENGTH): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}
