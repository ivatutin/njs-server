import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma client wrapper with NestJS lifecycle hooks.
 *
 * Prisma 7 specifics:
 * - PrismaClient generated to ./generated/prisma (not @prisma/client)
 * - DATABASE_URL is NOT in schema.prisma — passed via PrismaPg adapter
 * - Source of truth for connection: prisma.config.ts (migrations) and
 *   ConfigService (runtime, here)
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const url = config.get<string>('database.url');
    if (!url) {
      throw new Error('DATABASE_URL is not configured');
    }
    super({
      adapter: new PrismaPg({ connectionString: url }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
