import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '../../src/shared/domain/errors/forbidden.error';
import { TokenClaims } from '../../src/shared/domain/token-claims';
import { RolesGuard } from '../../src/modules/auth/interfaces/http/guards/roles.guard';

function contextFor(user?: TokenClaims): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardWith(required?: string[]): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

function claims(roles: string[]): TokenClaims {
  return { sub: 'kc-1', email: null, roles, issuedAt: 1700000000 };
}

describe('RolesGuard (ADR-0020)', () => {
  it('пропускает, когда метод без @Roles', () => {
    expect(guardWith(undefined).canActivate(contextFor(claims([])))).toBe(true);
  });

  it('пропускает, когда роль есть', () => {
    expect(guardWith(['admin']).canActivate(contextFor(claims(['admin'])))).toBe(true);
  });

  it('отвечает 403, когда роли нет', () => {
    expect(() => guardWith(['admin']).canActivate(contextFor(claims(['user'])))).toThrow(
      ForbiddenError,
    );
  });

  it('пропускает, когда совпала одна из нескольких требуемых ролей', () => {
    expect(guardWith(['admin', 'manager']).canActivate(contextFor(claims(['manager'])))).toBe(true);
  });

  it('отвечает 403, когда пользователь не аутентифицирован', () => {
    expect(() => guardWith(['admin']).canActivate(contextFor(undefined))).toThrow(ForbiddenError);
  });
});
