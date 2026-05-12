import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS, EventBus } from '@shared/application/event-bus.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { UserController } from './interfaces/http/user.controller';
import { CreateUserUseCase } from './application/use-cases/create-user/create-user.use-case';
import { GetUserByIdUseCase } from './application/use-cases/get-user-by-id/get-user-by-id.use-case';
import { UpdateUserProfileUseCase } from './application/use-cases/update-user-profile/update-user-profile.use-case';
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

@Module({
  controllers: [UserController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    CreateUserUseCase,
    GetUserByIdUseCase,
    UpdateUserProfileUseCase,
    UpdateUserContactsUseCase,
    VerifyUserEmailUseCase,
    VerifyUserPhoneUseCase,
    SuspendUserUseCase,
    ActivateUserUseCase,
    DeleteUserUseCase,
    OnUserSignedInHandler,
  ],
  exports: [],
})
export class UserModule implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly onUserSignedIn: OnUserSignedInHandler,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe('auth.user-signed-in', (event) =>
      this.onUserSignedIn.handle(
        event as unknown as { payload: UserSignedInPayload },
      ),
    );
  }
}
