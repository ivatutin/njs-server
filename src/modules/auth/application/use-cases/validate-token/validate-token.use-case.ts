import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import {
  IDENTITY_PROVIDER,
  IdentityProviderPort,
  TokenClaims,
} from '../../../domain/ports/identity-provider.port';
import { TOKEN_STORE, TokenStorePort } from '../../../domain/ports/token-store.port';
import { InvalidTokenError } from '../../../domain/errors/invalid-token.error';

@Injectable()
export class ValidateTokenUseCase implements UseCase<string, TokenClaims> {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProviderPort,
    @Inject(TOKEN_STORE) private readonly tokenStore: TokenStorePort,
  ) {}

  async execute(accessToken: string): Promise<TokenClaims> {
    if (await this.tokenStore.isTokenBlacklisted(accessToken)) {
      throw new InvalidTokenError('Token has been revoked');
    }
    return this.idp.verifyAccessToken(accessToken);
  }
}
