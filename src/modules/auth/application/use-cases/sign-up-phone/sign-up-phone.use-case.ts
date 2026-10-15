import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { generateLoginHandle } from '@shared/domain/login-handle';
import {
  ProvisionedUser,
  USER_PROVISIONING,
  UserProvisioning,
} from '@shared/application/user-provisioning.interface';
import {
  VERIFICATION_TOKEN_CONSUMER,
  VerificationTokenConsumer,
} from '@shared/application/verification-token-consumer.interface';
import { VerificationTokenExpiredError } from '@shared/domain/errors/verification-token-expired.error';
import { VerificationTokenInvalidError } from '@shared/domain/errors/verification-token-invalid.error';
import { TermsNotAcceptedError } from '../../../domain/errors/terms-not-accepted.error';
import { IDENTITY_ADMIN, IdentityAdminPort } from '../../../domain/ports/identity-admin.port';
import { TokenPair } from '../../../domain/ports/identity-provider.port';
import { UserTokenMintService } from '../../services/user-token-mint.service';
import { SignUpPhoneCommand } from './sign-up-phone.command';

/**
 * Keycloak 26 требует заполненный профиль (иначе пользователь «not fully set up»
 * и токены по нему не выдаются), а phone-регистрация имён не спрашивает —
 * поэтому подставляем нейтральные заглушки (решение координатора, Phase 2).
 */
const DEFAULT_FIRST_NAME = 'Пользователь';
const DEFAULT_LAST_NAME = '—';

export interface SignUpPhoneResult {
  user: ProvisionedUser;
  tokens: TokenPair;
}

/**
 * Phone-регистрация (Phase 2, контракт v1.2).
 *
 * Порядок: `acceptedTerms` → проверка `verificationToken` (предъявлен вместо
 * повторного OTP; канал — код по SMS или обратный звонок) → создание учётки в
 * Keycloak (`username` = телефон, без пароля) → shadow-пользователь с
 * подтверждённым телефоном → токены через CIBA (ADR-0015).
 */
@Injectable()
export class SignUpPhoneUseCase implements UseCase<SignUpPhoneCommand, SignUpPhoneResult> {
  constructor(
    @Inject(VERIFICATION_TOKEN_CONSUMER)
    private readonly verification: VerificationTokenConsumer,
    @Inject(IDENTITY_ADMIN) private readonly identityAdmin: IdentityAdminPort,
    @Inject(USER_PROVISIONING) private readonly users: UserProvisioning,
    private readonly mint: UserTokenMintService,
  ) {}

  async execute(cmd: SignUpPhoneCommand): Promise<SignUpPhoneResult> {
    if (cmd.acceptedTerms !== true) throw new TermsNotAcceptedError();

    const proof = await this.verification.consume(cmd.verificationToken);
    if (!proof) throw new VerificationTokenExpiredError();
    if (proof.purpose !== 'sign-up' || proof.target !== cmd.phone) {
      throw new VerificationTokenInvalidError();
    }

    const firstName = cmd.firstName ?? DEFAULT_FIRST_NAME;
    const lastName = cmd.lastName ?? DEFAULT_LAST_NAME;

    // Путь B (ADR-0017 ред.2): логин в Keycloak — стабильный handle, не телефон.
    // Генерируем ДО создания учётки, чтобы `username` и shadow-запись не разошлись.
    const handle = generateLoginHandle();

    const created = await this.identityAdmin.createPhoneUser({
      username: handle,
      phone: cmd.phone,
      firstName,
      lastName,
    });

    const user = await this.users.ensureFromIdentity({
      keycloakId: created.keycloakId,
      phone: cmd.phone,
      phoneVerified: true,
      handle,
      firstName,
      lastName,
    });

    const tokens = await this.mint.mint({
      // login_hint = handle: телефон в `login_hint` не уходит (PII), CIBA резолвит логин по username.
      loginHint: handle,
      keycloakId: created.keycloakId,
      purpose: 'sign-up',
      phone: cmd.phone,
    });

    return { user, tokens };
  }
}
