import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumedVerificationToken,
  VerificationTokenConsumer,
} from '@shared/application/verification-token-consumer.interface';
import {
  VERIFICATION_TOKEN_ISSUER,
  VerificationTokenIssuer,
} from '../../domain/ports/verification-token.port';

/**
 * Реализация shared-порта `VERIFICATION_TOKEN_CONSUMER` на хранилище токенов
 * OTP-контекста: auth-контексту нужен факт «контакт подтверждён», но владелец
 * токена — OTP-модуль, поэтому наружу выставлен порт, а не модуль.
 */
@Injectable()
export class OtpVerificationTokenConsumer implements VerificationTokenConsumer {
  constructor(
    @Inject(VERIFICATION_TOKEN_ISSUER) private readonly tokens: VerificationTokenIssuer,
  ) {}

  async consume(token: string): Promise<ConsumedVerificationToken | null> {
    const payload = await this.tokens.consume(token);
    if (!payload) return null;
    return { target: payload.target, purpose: payload.purpose };
  }
}
