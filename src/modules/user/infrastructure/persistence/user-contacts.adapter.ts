import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, EventBus } from '@shared/application/event-bus.interface';
import { UserContacts, UserContactsSnapshot } from '@shared/application/user-contacts.interface';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { Phone } from '../../domain/value-objects/phone.vo';
import { EmailAlreadyExistsError } from '../../domain/errors/email-already-exists.error';
import { PhoneAlreadyExistsError } from '../../domain/errors/phone-already-exists.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserMapper } from './user.mapper';
import { mapPrismaError } from './prisma-error.helper';

function toSnapshot(user: User): UserContactsSnapshot {
  return {
    id: user.id.toString(),
    keycloakId: user.keycloakId,
    email: user.email?.toString() ?? null,
    phone: user.phone.getValue(),
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: user.roles,
    status: user.status.getValue(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Реализация shared-порта `USER_CONTACTS` (ADR-0017 ред. 2): смена контакта flow'ом
 * `contact-change`, где уникальность телефона держим мы (Keycloak атрибут не проверяет),
 * а ре-чек занятости обязан быть **в той же транзакции**, что и запись.
 *
 * Домен-события публикуются после коммита — так же, как в `PrismaUserRepository`.
 */
@Injectable()
export class UserContactsAdapter implements UserContacts {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  async applyVerifiedChange(params: {
    keycloakId: string;
    email?: string | null;
    phone?: string | null;
  }): Promise<UserContactsSnapshot> {
    const email = params.email ? Email.create(params.email).toString() : null;
    const phone = params.phone ? Phone.create(params.phone).getValue() : null;

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const row = await tx.user.findUnique({ where: { keycloakId: params.keycloakId } });
        if (!row) throw new UserNotFoundError(`keycloakId=${params.keycloakId}`);

        // Ре-чек занятости в ТОЙ ЖЕ транзакции: закрывает TOCTOU между request и verify.
        if (email !== null) {
          const taken = await tx.user.findUnique({ where: { email } });
          if (taken && taken.id !== row.id) throw new EmailAlreadyExistsError();
        }
        if (phone !== null) {
          const taken = await tx.user.findUnique({ where: { phone } });
          if (taken && taken.id !== row.id) throw new PhoneAlreadyExistsError();
        }

        const entity = UserMapper.toDomain(row);
        entity.applyVerifiedContactChange({
          email: email ?? undefined,
          phone: phone ?? undefined,
        });

        const data = UserMapper.toPersistence(entity);
        await tx.user.update({ where: { id: data.id }, data });

        return entity;
      });
    } catch (err) {
      // Гонка на уникальном индексе (P2002) превращается в тот же 409, что и ре-чек выше.
      mapPrismaError(err);
    }

    const events = user.pullDomainEvents();
    if (events.length > 0) await this.eventBus.publishAll(events);

    return toSnapshot(user);
  }
}
