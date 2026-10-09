import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ProvisionedUser, UserProvisioning } from '@shared/application/user-provisioning.interface';
import { User } from '../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../domain/repositories/user.repository';

/**
 * Реализация shared-порта `USER_PROVISIONING` на данных user-контекста.
 * Auth-контексту нужен `UserDto` в ответе на регистрацию, но владелец данных —
 * user-модуль, поэтому наружу выставлен порт, а не модуль.
 */
@Injectable()
export class UserProvisioningAdapter implements UserProvisioning {
  private readonly logger = new Logger(UserProvisioningAdapter.name);

  constructor(@Inject(USER_REPOSITORY) private readonly userRepo: UserRepository) {}

  async ensureFromIdentity(params: {
    keycloakId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<ProvisionedUser> {
    const keycloakShort = params.keycloakId.substring(0, 8);
    const existing = await this.userRepo.findByKeycloakId(params.keycloakId);

    if (existing) {
      const currentEmail = existing.email?.toString() ?? null;
      if (currentEmail !== params.email) {
        this.logger.warn(
          `Email drift for kc=${keycloakShort}...: "${currentEmail}" -> "${params.email}" ` +
            `(синхронизация контакта — отдельный flow, Phase 4)`,
        );
      }
      return this.toView(existing);
    }

    const user = User.create({
      keycloakId: params.keycloakId,
      email: params.email,
      firstName: params.firstName ?? null,
      lastName: params.lastName ?? null,
    });
    await this.userRepo.save(user);
    this.logger.log(`Provisioned local user for kc=${keycloakShort}... (pending_verification)`);

    return this.toView(user);
  }

  private toView(user: User): ProvisionedUser {
    return {
      id: user.id.toString(),
      keycloakId: user.keycloakId,
      email: user.email?.toString() ?? null,
      phone: user.phone.getValue(),
      emailVerified: user.isEmailVerified(),
      phoneVerified: user.isPhoneVerified(),
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      status: user.status.getValue(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
