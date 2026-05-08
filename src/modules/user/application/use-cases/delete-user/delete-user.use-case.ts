import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { UserId } from '../../../domain/value-objects/user-id.vo';

@Injectable()
export class DeleteUserUseCase implements UseCase<string, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    // Полагаемся на P2025 → UserNotFoundError из mapPrismaError
    await this.userRepo.delete(UserId.fromString(userId));
  }
}
