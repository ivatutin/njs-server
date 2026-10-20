import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { UserNotFoundError } from '@shared/domain/errors/user-not-found.error';
import { User } from '../../../domain/entities/user.entity';
import { IDENTITY_PROFILE, IdentityProfilePort } from '../../../domain/ports/identity-profile.port';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { UpdateMyProfileCommand } from './update-my-profile.command';

/**
 * Self-service профиль (контракт v1.6, `PATCH /users/me/profile`).
 *
 * Порядок обязателен: **сначала Keycloak, затем shadow**.
 * - Keycloak — источник истины по имени (там же имя спрашивается при подтверждении контакта);
 * - если Keycloak недоступен → `503` (`IdentityProfileUnavailableError`), shadow **не трогаем**,
 *   чтобы не создать расхождение, которое потом всё равно откатится синхронизацией на входе;
 * - если shadow упал уже после Keycloak — расхождение лечится той же синхронизацией
 *   (`OnUserSignedInHandler`, B этого пакета), поэтому отдельная компенсация не нужна.
 */
@Injectable()
export class UpdateMyProfileUseCase implements UseCase<UpdateMyProfileCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    @Inject(IDENTITY_PROFILE) private readonly identityProfile: IdentityProfilePort,
  ) {}

  async execute(cmd: UpdateMyProfileCommand): Promise<User> {
    const user = await this.userRepo.findByKeycloakId(cmd.keycloakId);
    if (!user) {
      // Shadow-записи быть не должно: она создаётся при входе. 404 честнее, чем 500.
      throw new UserNotFoundError(`keycloakId=${cmd.keycloakId}`);
    }

    await this.identityProfile.updateName({
      keycloakId: cmd.keycloakId,
      firstName: cmd.firstName,
      lastName: cmd.lastName,
    });

    user.updateProfile({ firstName: cmd.firstName, lastName: cmd.lastName });
    await this.userRepo.save(user);
    return user;
  }
}
