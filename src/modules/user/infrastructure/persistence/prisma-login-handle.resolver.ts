import { Injectable } from '@nestjs/common';
import { LoginHandleResolver } from '@shared/application/login-handle.interface';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

/**
 * Реализация shared-порта `LOGIN_HANDLE_RESOLVER` на данных user-контекста (ADR-0017 ред.2, путь B).
 *
 * Резолвер **локальный**: `handle` — уникальная колонка shadow-таблицы, поэтому входу не нужен вызов
 * admin-API Keycloak. `null` означает «handle неизвестен» (строка создана до политики или вне наших sign-up) —
 * тогда вызывающая сторона падает на email (`loginWithEmailAllowed=true`).
 */
@Injectable()
export class PrismaLoginHandleResolver implements LoginHandleResolver {
  constructor(private readonly prisma: PrismaService) {}

  async byPhone(phone: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { phone },
      select: { handle: true },
    });
    return row?.handle ?? null;
  }

  async byEmail(email: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
      select: { handle: true },
    });
    return row?.handle ?? null;
  }

  async byKeycloakId(keycloakId: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { handle: true },
    });
    return row?.handle ?? null;
  }
}
