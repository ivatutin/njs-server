import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { User } from '../../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';

@Injectable()
export class ActivateUserUseCase implements UseCase<string, User> {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepo: UserRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.userRepo.findById(UserId.fromString(userId));
    if (!user) throw new UserNotFoundError(`id=${userId}`);

    user.activate();
    await this.userRepo.save(user);
    return user;
  }
}
