import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { User } from '../../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';

/**
 * Looks up a User by their Keycloak `sub`. Primary use is the `/users/me`
 * endpoint: controller receives TokenClaims from JwtAuthGuard, passes
 * claims.sub here, and we return the local user record.
 *
 * After OnUserSignedInHandler runs on first sign-in, every authenticated
 * user has a local record — UserNotFoundError here would indicate a bug
 * in cross-module event delivery, not a user error.
 */
@Injectable()
export class GetUserByKeycloakIdUseCase implements UseCase<string, User> {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepo: UserRepository) {}

  async execute(keycloakId: string): Promise<User> {
    const user = await this.userRepo.findByKeycloakId(keycloakId);
    if (!user) throw new UserNotFoundError(`keycloakId=${keycloakId}`);
    return user;
  }
}
