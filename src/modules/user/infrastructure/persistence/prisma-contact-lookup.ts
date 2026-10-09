import { Injectable } from '@nestjs/common';
import { ContactLookup } from '@shared/application/contact-lookup.interface';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

/**
 * Реализация shared-порта `CONTACT_LOOKUP` на данных user-контекста.
 * Живёт в user-модуле, потому что он владелец таблицы; OTP-контекст работает
 * только через порт.
 */
@Injectable()
export class PrismaContactLookup implements ContactLookup {
  constructor(private readonly prisma: PrismaService) {}

  async existsByPhone(phone: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    return row !== null;
  }
}
