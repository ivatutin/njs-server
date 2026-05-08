import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { User } from '../../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { Email } from '../../../domain/value-objects/email.vo';
import { Phone } from '../../../domain/value-objects/phone.vo';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { EmailAlreadyExistsError } from '../../../domain/errors/email-already-exists.error';
import { PhoneAlreadyExistsError } from '../../../domain/errors/phone-already-exists.error';
import { UpdateUserContactsCommand } from './update-user-contacts.command';

@Injectable()
export class UpdateUserContactsUseCase implements UseCase<UpdateUserContactsCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
  ) {}

  async execute(cmd: UpdateUserContactsCommand): Promise<User> {
    const user = await this.userRepo.findById(UserId.fromString(cmd.userId));
    if (!user) throw new UserNotFoundError(`id=${cmd.userId}`);

    // pre-check уникальности (если задан новый контакт и он отличается)
    if (cmd.email !== undefined && cmd.email !== null) {
      const newEmail = Email.create(cmd.email);
      const currentEmail = user.email?.toString() ?? null;
      if (currentEmail !== newEmail.toString()) {
        const existing = await this.userRepo.findByEmail(newEmail);
        if (existing && !existing.id.equals(user.id)) {
          throw new EmailAlreadyExistsError();
        }
      }
    }
    if (cmd.phone !== undefined && cmd.phone !== null) {
      const newPhone = Phone.create(cmd.phone);
      const currentPhone = user.phone.getValue();
      if (currentPhone !== newPhone.getValue()) {
        const existing = await this.userRepo.findByPhone(newPhone);
        if (existing && !existing.id.equals(user.id)) {
          throw new PhoneAlreadyExistsError();
        }
      }
    }

    user.updateContacts({
      email: cmd.email,
      phone: cmd.phone,
    });

    await this.userRepo.save(user);
    return user;
  }
}
