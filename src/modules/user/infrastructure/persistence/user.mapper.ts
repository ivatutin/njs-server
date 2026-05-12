import { Prisma } from '../../../../generated/prisma/client';
import type { User as PrismaUser } from '../../../../generated/prisma/client';
import { User } from '../../domain/entities/user.entity';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { Phone } from '../../domain/value-objects/phone.vo';
import { UserStatus, UserStatusType } from '../../domain/value-objects/user-status.vo';

/**
 * Преобразует данные между Prisma rows и доменной сущностью User.
 * Domain не должен импортировать ничего отсюда —
 * только infrastructure знает оба представления.
 */
export class UserMapper {
  /** Prisma row → Domain User (через reconstitute, без эмита событий) */
  static toDomain(raw: PrismaUser): User {
    return User.reconstitute(UserId.fromString(raw.id), {
      email: raw.email ? Email.create(raw.email) : null,
      phone: Phone.create(raw.phone),
      emailVerifiedAt: raw.emailVerifiedAt,
      phoneVerifiedAt: raw.phoneVerifiedAt,
      keycloakId: raw.keycloakId,
      firstName: raw.firstName,
      lastName: raw.lastName,
      roles: raw.roles,
      metadata: raw.metadata as Record<string, unknown> | null,
      status: UserStatus.create(raw.status as UserStatusType),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  /**
   * Domain User → Prisma input (для create/update/upsert).
   * metadata: null доменное → Prisma.JsonNull (запишется NULL в jsonb),
   *          объект → как есть.
   */
  static toPersistence(user: User) {
    return {
      id: user.id.toString(),
      email: user.email?.toString() ?? null,
      phone: user.phone.getValue(),
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      keycloakId: user.keycloakId,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      metadata: user.metadata === null ? Prisma.JsonNull : (user.metadata as Prisma.InputJsonValue),
      status: user.status.getValue(),
      updatedAt: user.updatedAt,
    };
  }
}
