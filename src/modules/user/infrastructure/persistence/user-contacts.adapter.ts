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

  normalize(channel: 'email' | 'phone', value: string): string {
    if (channel === 'email') return Email.create(value).toString();
    return Phone.create(value).getValue() ?? value;
  }

  async find(keycloakId: string): Promise<UserContactsSnapshot | null> {
    const row = await this.prisma.user.findUnique({ where: { keycloakId } });
    return row ? toSnapshot(UserMapper.toDomain(row)) : null;
  }

  async listForReconciliation(params: {
    afterId?: string | null;
    limit: number;
  }): Promise<UserContactsSnapshot[]> {
    const rows = await this.prisma.user.findMany({
      take: params.limit,
      orderBy: { id: 'asc' },
      ...(params.afterId ? { cursor: { id: params.afterId }, skip: 1 } : {}),
    });
    return rows.map((row) => toSnapshot(UserMapper.toDomain(row)));
  }

  async isContactTaken(params: { email?: string | null; phone?: string | null }): Promise<boolean> {
    const email = params.email ? Email.create(params.email).toString() : null;
    const phone = params.phone ? Phone.create(params.phone).getValue() : null;
    if (email === null && phone === null) return false;

    const row = await this.prisma.user.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      select: { id: true },
    });
    return row !== null;
  }

  async rollback(params: {
    keycloakId: string;
    email: string | null;
    phone: string | null;
    emailVerifiedAt: string | null;
    phoneVerifiedAt: string | null;
  }): Promise<void> {
    // Пишем напрямую, минуя доменные инварианты: это откат к уже существовавшему состоянию,
    // а не пользовательская операция (ADR-0017 §3, компенсация).
    await this.prisma.user.update({
      where: { keycloakId: params.keycloakId },
      data: {
        email: params.email,
        phone: params.phone,
        emailVerifiedAt: params.emailVerifiedAt ? new Date(params.emailVerifiedAt) : null,
        phoneVerifiedAt: params.phoneVerifiedAt ? new Date(params.phoneVerifiedAt) : null,
      },
    });
  }

  /**
   * Дочиняет флаг подтверждения в shadow (ADR-0017 §3, ред. 4: «флаги монотонны, true побеждает»).
   *
   * Путь тот же, что у события `auth.email-verified` (`OnEmailVerifiedHandler`): доменный
   * `verifyEmail()` / `verifyPhone()` (идемпотентны, `pending_verification` → `active`) + публикация
   * доменных событий после записи. Нужен, когда Keycloak подтвердил контакт сам (клик по ссылке),
   * а событие до нас не доехало — тогда shadow навсегда остался бы неподтверждённым.
   */
  async markVerified(params: {
    keycloakId: string;
    channel: 'email' | 'phone';
  }): Promise<UserContactsSnapshot | null> {
    const row = await this.prisma.user.findUnique({ where: { keycloakId: params.keycloakId } });
    if (!row) return null;

    const user = UserMapper.toDomain(row);
    const alreadyVerified =
      params.channel === 'email' ? user.isEmailVerified() : user.isPhoneVerified();
    const hasContact =
      params.channel === 'email' ? user.email !== null : user.phone.getValue() !== null;
    // Дочинять нечего: контакта в канале нет (домен бросил бы) или он уже подтверждён.
    if (alreadyVerified || !hasContact) return null;

    if (params.channel === 'email') user.verifyEmail();
    else user.verifyPhone();

    const data = UserMapper.toPersistence(user);
    await this.prisma.user.update({ where: { id: data.id }, data });

    const events = user.pullDomainEvents();
    if (events.length > 0) await this.eventBus.publishAll(events);

    return toSnapshot(user);
  }

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
