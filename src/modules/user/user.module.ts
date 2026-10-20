import { Global, Inject, Module, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS, EventBus } from '@shared/application/event-bus.interface';
import { CONTACT_LOOKUP } from '@shared/application/contact-lookup.interface';
import { USER_CONTACTS } from '@shared/application/user-contacts.interface';
import { LOGIN_HANDLE_RESOLVER } from '@shared/application/login-handle.interface';
import { USER_PROVISIONING } from '@shared/application/user-provisioning.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { PrismaContactLookup } from './infrastructure/persistence/prisma-contact-lookup';
import { PrismaLoginHandleResolver } from './infrastructure/persistence/prisma-login-handle.resolver';
import { UserContactsAdapter } from './infrastructure/persistence/user-contacts.adapter';
import { UserProvisioningAdapter } from './infrastructure/provisioning/user-provisioning.adapter';
import { UserController } from './interfaces/http/user.controller';
import { CreateUserUseCase } from './application/use-cases/create-user/create-user.use-case';
import { GetUserByIdUseCase } from './application/use-cases/get-user-by-id/get-user-by-id.use-case';
import { GetUserByKeycloakIdUseCase } from './application/use-cases/get-user-by-keycloak-id/get-user-by-keycloak-id.use-case';
import { UpdateUserProfileUseCase } from './application/use-cases/update-user-profile/update-user-profile.use-case';
import { UpdateMyProfileUseCase } from './application/use-cases/update-my-profile/update-my-profile.use-case';
import { IDENTITY_PROFILE } from './domain/ports/identity-profile.port';
import { KeycloakIdentityProfileAdapter } from './infrastructure/keycloak/keycloak-identity-profile.adapter';
import { UpdateUserContactsUseCase } from './application/use-cases/update-user-contacts/update-user-contacts.use-case';
import { VerifyUserEmailUseCase } from './application/use-cases/verify-user-email/verify-user-email.use-case';
import { VerifyUserPhoneUseCase } from './application/use-cases/verify-user-phone/verify-user-phone.use-case';
import { SuspendUserUseCase } from './application/use-cases/suspend-user/suspend-user.use-case';
import { ActivateUserUseCase } from './application/use-cases/activate-user/activate-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user/delete-user.use-case';
import {
  OnUserSignedInHandler,
  UserSignedInPayload,
} from './application/event-handlers/on-user-signed-in.handler';
import {
  EmailVerifiedPayload,
  OnEmailVerifiedHandler,
} from './application/event-handlers/on-email-verified.handler';

/**
 * `@Global` здесь осознанно: модуль экспортирует shared-порты, которые нужны
 * другим контекстам — `CONTACT_LOOKUP` (занят ли телефон, для OTP) и
 * `USER_PROVISIONING` (создать shadow-user, для email-регистрации). Так другие
 * модули зависят от портов, а не от user-модуля.
 */
@Global()
@Module({
  controllers: [UserController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    PrismaContactLookup,
    { provide: CONTACT_LOOKUP, useExisting: PrismaContactLookup },
    PrismaLoginHandleResolver,
    { provide: LOGIN_HANDLE_RESOLVER, useExisting: PrismaLoginHandleResolver },
    UserContactsAdapter,
    { provide: USER_CONTACTS, useExisting: UserContactsAdapter },
    UserProvisioningAdapter,
    { provide: USER_PROVISIONING, useExisting: UserProvisioningAdapter },
    CreateUserUseCase,
    GetUserByIdUseCase,
    GetUserByKeycloakIdUseCase,
    UpdateUserProfileUseCase,
    UpdateMyProfileUseCase,
    // Self-service профиль (контракт v1.6): имя пишется в Keycloak (source of truth) и в shadow
    { provide: IDENTITY_PROFILE, useClass: KeycloakIdentityProfileAdapter },
    UpdateUserContactsUseCase,
    VerifyUserEmailUseCase,
    VerifyUserPhoneUseCase,
    SuspendUserUseCase,
    ActivateUserUseCase,
    DeleteUserUseCase,
    OnUserSignedInHandler,
    OnEmailVerifiedHandler,
  ],
  exports: [CONTACT_LOOKUP, USER_PROVISIONING, LOGIN_HANDLE_RESOLVER, USER_CONTACTS],
})
export class UserModule implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly onUserSignedIn: OnUserSignedInHandler,
    private readonly onEmailVerified: OnEmailVerifiedHandler,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe('auth.user-signed-in', (event) =>
      this.onUserSignedIn.handle(event as unknown as { payload: UserSignedInPayload }),
    );
    this.eventBus.subscribe('auth.email-verified', (event) =>
      this.onEmailVerified.handle(event as unknown as { payload: EmailVerifiedPayload }),
    );
  }
}
