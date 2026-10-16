import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AccountSecurityController } from '../../src/modules/auth/interfaces/http/account-security.controller';

function handlerOf(method: string): object {
  const handler = (AccountSecurityController.prototype as unknown as Record<string, unknown>)[method];
  if (typeof handler !== 'function') throw new Error(`нет метода ${method}`);
  return handler as object;
}

describe('POST /users/me/logout-all (контракт v1.4)', () => {
  it('маршрут объявлен как POST logout-all с ответом 204', () => {
    const handler = handlerOf('logoutAll');

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('logout-all');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
  });

  it('ReauthTokenGuard не навешен (решение координатора: без X-Reauth-Token)', () => {
    const handler = handlerOf('logoutAll');

    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });
});
