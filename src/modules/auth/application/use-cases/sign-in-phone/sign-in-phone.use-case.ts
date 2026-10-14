import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { CONTACT_LOOKUP, ContactLookup } from '@shared/application/contact-lookup.interface';
import {
  VERIFICATION_TOKEN_CONSUMER,
  VerificationTokenConsumer,
} from '@shared/application/verification-token-consumer.interface';
import { VerificationTokenExpiredError } from '@shared/domain/errors/verification-token-expired.error';
import { VerificationTokenInvalidError } from '@shared/domain/errors/verification-token-invalid.error';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error';
import { TokenPair } from '../../../domain/ports/identity-provider.port';
import { UserTokenMintService } from '../../services/user-token-mint.service';
import { SignInPhoneCommand } from './sign-in-phone.command';

/**
 * Phone-вход (Phase 2, контракт v1.2).
 *
 * `verificationToken` уже доказывает владение номером (код или звонок), поэтому
 * пароль не нужен. Anti-enumeration: неизвестный номер даёт тот же
 * `401 InvalidCredentials`, что и неверный OTP, и не порождает ни одного запроса
 * в Keycloak (иначе по времени ответа можно было бы судить о наличии аккаунта).
 */
@Injectable()
export class SignInPhoneUseCase implements UseCase<SignInPhoneCommand, TokenPair> {
  constructor(
    @Inject(VERIFICATION_TOKEN_CONSUMER)
    private readonly verification: VerificationTokenConsumer,
    @Inject(CONTACT_LOOKUP) private readonly contacts: ContactLookup,
    private readonly mint: UserTokenMintService,
  ) {}

  async execute(cmd: SignInPhoneCommand): Promise<TokenPair> {
    const proof = await this.verification.consume(cmd.verificationToken);
    if (!proof) throw new VerificationTokenExpiredError();
    if (proof.purpose !== 'sign-in' || proof.target !== cmd.phone) {
      throw new VerificationTokenInvalidError();
    }

    const keycloakId = await this.contacts.findKeycloakIdByPhone(cmd.phone);
    if (!keycloakId) throw new InvalidCredentialsError();

    return this.mint.mint({
      loginHint: cmd.phone,
      keycloakId,
      purpose: 'sign-in',
      phone: cmd.phone,
    });
  }
}
