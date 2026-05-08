import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { User } from '../../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { UpdateUserProfileCommand } from './update-user-profile.command';

@Injectable()
export class UpdateUserProfileUseCase implements UseCase<UpdateUserProfileCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
  ) {}

  async execute(cmd: UpdateUserProfileCommand): Promise<User> {
    const user = await this.userRepo.findById(UserId.fromString(cmd.userId));
    if (!user) throw new UserNotFoundError(`id=${cmd.userId}`);

    user.updateProfile({
      firstName: cmd.firstName,
      lastName: cmd.lastName,
    });

    await this.userRepo.save(user);
    return user;
  }
}
