import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { User } from '../../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { Email } from '../../../domain/value-objects/email.vo';
import { Phone } from '../../../domain/value-objects/phone.vo';
import { EmailAlreadyExistsError } from '../../../domain/errors/email-already-exists.error';
import { PhoneAlreadyExistsError } from '../../../domain/errors/phone-already-exists.error';
import { CreateUserCommand } from './create-user.command';

@Injectable()
export class CreateUserUseCase implements UseCase<CreateUserCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
  ) {}

  async execute(cmd: CreateUserCommand): Promise<User> {
    // pre-check уникальности (UX), БД защищена UNIQUE и в случае race условие отловит mapPrismaError
    if (cmd.email) {
      const existing = await this.userRepo.findByEmail(Email.create(cmd.email));
      if (existing) throw new EmailAlreadyExistsError();
    }
    if (cmd.phone) {
      const existing = await this.userRepo.findByPhone(Phone.create(cmd.phone));
      if (existing) throw new PhoneAlreadyExistsError();
    }

    const user = User.create({
      email: cmd.email,
      phone: cmd.phone,
      keycloakId: cmd.keycloakId,
      firstName: cmd.firstName,
      lastName: cmd.lastName,
      roles: cmd.roles,
      metadata: cmd.metadata,
    });

    await this.userRepo.save(user);
    return user;
  }
}
