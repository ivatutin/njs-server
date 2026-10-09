import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenClaims } from '@shared/domain/token-claims';

/**
 * Param decorator that returns the authenticated user's token claims
 * attached by JwtAuthGuard. Returns undefined on @Public endpoints.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenClaims | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: TokenClaims }>();
    return request.user;
  },
);
