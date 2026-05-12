import { Inject, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { UseCase } from '@shared/application/use-case.interface';
import {
  IDENTITY_PROVIDER,
  IdentityProviderPort,
} from '../../../domain/ports/identity-provider.port';
import { TOKEN_STORE, TokenStorePort } from '../../../domain/ports/token-store.port';
import { SignOutCommand } from './sign-out.command';

@Injectable()
export class SignOutUseCase implements UseCase<SignOutCommand, void> {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProviderPort,
    @Inject(TOKEN_STORE) private readonly tokenStore: TokenStorePort,
  ) {}

  async execute(cmd: SignOutCommand): Promise<void> {
    // Revoke refresh token on Keycloak side (kills future refreshes).
    await this.idp.signOut(cmd.refreshToken);

    // Blacklist the access token until its natural expiry. Keycloak does
    // NOT invalidate access JWTs server-side — they remain cryptographically
    // valid till `exp`. Without this step, a stolen access token could be
    // used until expiration.
    if (cmd.accessToken) {
      const ttl = this.remainingTtl(cmd.accessToken);
      if (ttl > 0) {
        await this.tokenStore.blacklistToken(cmd.accessToken, ttl);
      }
    }
  }

  /** Returns seconds until `exp`, or 0 if token has no `exp` / already expired. */
  private remainingTtl(token: string): number {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === 'string' || typeof decoded.exp !== 'number') {
      return 0;
    }
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, decoded.exp - now);
  }
}
