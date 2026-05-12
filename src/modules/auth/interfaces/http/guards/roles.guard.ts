import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@shared/domain/errors/forbidden.error';
import { TokenClaims } from '../../../domain/ports/identity-provider.port';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Global guard that runs after JwtAuthGuard. If endpoint is marked with
 * @Roles('admin', ...), checks request.user.roles for at least one match.
 * If no @Roles set, passes through.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest<{ user?: TokenClaims }>();
    const user = request.user;
    if (!user) {
      // JwtAuthGuard already returned, this branch is defensive.
      throw new ForbiddenError('Not authenticated');
    }

    const hasRole = required.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new ForbiddenError(`Required role: ${required.join(' or ')}`);
    }
    return true;
  }
}
