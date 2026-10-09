import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { OtpHasher } from '../../domain/ports/otp-hasher.port';

/**
 * argon2id-хешер OTP-кода (ADR-0011: plaintext в Redis не хранится).
 *
 * Параметры — рекомендации OWASP для argon2id (m=19 MiB, t=2, p=1): код живёт
 * 5 минут и проверяется максимум 5 раз, поэтому больше памяти/итераций не нужно.
 */
@Injectable()
export class Argon2OtpHasher implements OtpHasher {
  private static readonly options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  hash(code: string): Promise<string> {
    return hash(code, Argon2OtpHasher.options);
  }

  async verify(codeHash: string, code: string): Promise<boolean> {
    try {
      return await verify(codeHash, code);
    } catch {
      // Битый/чужой хеш в хранилище — это «код неверный», а не 500.
      return false;
    }
  }
}
