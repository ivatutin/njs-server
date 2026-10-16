import { Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import { RevokeUserAccessCommand } from '../revoke-user-access/revoke-user-access.command';
import { RevokeUserAccessUseCase } from '../revoke-user-access/revoke-user-access.use-case';
import { LogoutAllCommand } from './logout-all.command';

/**
 * `POST /users/me/logout-all` (контракт v1.4, ADR-0018): выход со **всех** устройств.
 *
 * «Выйти везде» — это ровно отзыв доступа по `sub`, поэтому use case тонкий: вся логика неделимой операции
 * живёт в `RevokeUserAccessUseCase` (гасим все сессии Keycloak → ставим метку `auth:sub-revoked:<sub>`).
 * Уже выданные access-токены после метки перестают приниматься (`401`), refresh-токены устройств мертвы,
 * потому что сессии погашены в Keycloak.
 *
 * Отличие от `POST /auth/sign-out`: тот гасит **только текущую** сессию (пер-токенный блоклист) — иначе
 * выход на одном устройстве убивал бы все. Здесь гасим все, **включая текущую**: `204` означает «вы вышли
 * везде», следующий запрос со старым токеном → `401`.
 *
 * `X-Reauth-Token` не требуется: операция не даёт захвата аккаунта (худшее — разлогин, о котором и просят),
 * а требование reauth создало бы тупик для passwordless-пользователей (I4). Ошибка инфраструктуры →
 * `503` без нового кода; метка не выставляется, повтор безопасен, операция идемпотентна.
 */
@Injectable()
export class LogoutAllUseCase implements UseCase<LogoutAllCommand, void> {
  constructor(private readonly revokeAccess: RevokeUserAccessUseCase) {}

  async execute(cmd: LogoutAllCommand): Promise<void> {
    await this.revokeAccess.execute(
      new RevokeUserAccessCommand(cmd.keycloakId, 'logout-everywhere'),
    );
  }
}
