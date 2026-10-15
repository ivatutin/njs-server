import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { TokenClaims } from '@shared/domain/token-claims';
import { ReauthTokenExpiredError } from '../../../domain/errors/reauth-token-expired.error';
import { ReauthTokenInvalidError } from '../../../domain/errors/reauth-token-invalid.error';
import {
  REAUTH_TOKEN_STORE,
  ReauthTokenStore,
} from '../../../domain/ports/reauth-token-store.port';

/** Имя заголовка из контракта. */
export const REAUTH_TOKEN_HEADER = 'x-reauth-token';

/**
 * Требует `X-Reauth-Token` от **того же** пользователя, от имени которого пришёл
 * access-токен, и расходует его (одноразовость). Ставится на операции, которым
 * нужно «пароль введён недавно»: смена контакта и смена пароля.
 *
 * Запускается после глобального `JwtAuthGuard` (глобальные гарды выполняются
 * первыми), поэтому `request.user` уже заполнен.
 */
@Injectable()
export class ReauthTokenGuard implements CanActivate {
  constructor(@Inject(REAUTH_TOKEN_STORE) private readonly reauthTokens: ReauthTokenStore) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: TokenClaims;
    }>();

    const token = request.headers[REAUTH_TOKEN_HEADER];
    if (!token) throw new ReauthTokenInvalidError('Missing X-Reauth-Token header');

    const proof = await this.reauthTokens.consume(token);
    if (!proof) throw new ReauthTokenExpiredError();

    const user = request.user;
    if (!user || proof.keycloakId !== user.sub) {
      // Токен валиден, но выдан другому пользователю — не пропускаем.
      throw new ReauthTokenInvalidError('Reauth token belongs to another user');
    }

    return true;
  }
}
