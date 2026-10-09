import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Marks an endpoint as accessible without authentication.
 *
 * Живёт в shared, а не в модуле auth: декоратор — техническая метка для
 * глобального JwtAuthGuard, её используют контроллеры всех контекстов
 * (health, dev/test, auth/otp), а импорт "модуль → модуль" запрещён.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
