import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case.interface';
import {
  IDENTITY_PROVIDER,
  IdentityProviderPort,
  TokenPair,
} from '../../../domain/ports/identity-provider.port';

@Injectable()
export class RefreshTokenUseCase implements UseCase<string, TokenPair> {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProviderPort,
  ) {}

  async execute(refreshToken: string): Promise<TokenPair> {
    return this.idp.refresh(refreshToken);
  }
}
