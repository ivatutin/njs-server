import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '@shared/domain/errors/unauthorized.error';
import { ValidateTokenUseCase } from '../../../application/use-cases/validate-token/validate-token.use-case';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global guard. Reads Authorization: Bearer <jwt>, validates via
 * ValidateTokenUseCase (blacklist + signature/issuer), attaches
 * TokenClaims to request.user.
 *
 * Endpoints marked with @Public() are bypassed.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly validateToken: ValidateTokenUseCase,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const auth = request.headers['authorization'];
    if (!auth || !/^Bearer\s+\S+$/i.test(auth)) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }
    const token = auth.replace(/^Bearer\s+/i, '');

    const claims = await this.validateToken.execute(token);
    request.user = claims;
    return true;
  }
}
