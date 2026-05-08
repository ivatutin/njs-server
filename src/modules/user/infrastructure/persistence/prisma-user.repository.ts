import { Inject, Injectable } from '@nestjs/common';
import { UserRepository } from '../../domain/repositories/user.repository';
import { User } from '../../domain/entities/user.entity';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { EVENT_BUS, EventBus } from '@shared/application/event-bus.interface';
import { UserMapper } from './user.mapper';
import { mapPrismaError } from './prisma-error.helper';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: id.toString() },
    });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.toString() },
    });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByKeycloakId(keycloakId: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { keycloakId },
    });
    return row ? UserMapper.toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const data = UserMapper.toPersistence(user);

    try {
      await this.prisma.user.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      });
    } catch (err) {
      mapPrismaError(err);
    }

    // Публикуем события ПОСЛЕ успешного коммита БД.
    // TODO: outbox pattern для транзакционной публикации.
    const events = user.pullDomainEvents();
    if (events.length > 0) {
      await this.eventBus.publishAll(events);
    }
  }

  async delete(id: UserId): Promise<void> {
    try {
      await this.prisma.user.delete({
        where: { id: id.toString() },
      });
    } catch (err) {
      mapPrismaError(err);
    }
  }
}
