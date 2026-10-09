import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { OTP_CODE_LENGTH } from '../../../domain/otp-policy';

const codePattern = new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`);

/** `POST /auth/otp/verify` — контракт v1.0. */
const VerifyOtpSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(codePattern, `code must be ${OTP_CODE_LENGTH} digits`),
});

export class VerifyOtpDto extends createZodDto(VerifyOtpSchema) {}
