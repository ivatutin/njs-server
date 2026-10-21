import { Injectable, Logger } from '@nestjs/common';
import { UserNotFoundError } from '@shared/domain/errors/user-not-found.error';
import { KeycloakAdminClient } from '@shared/infrastructure/keycloak/keycloak-admin.client';
import { IdentityProfileUnavailableError } from '../../domain/errors/identity-profile-unavailable.error';
import { IdentityProfilePort } from '../../domain/ports/identity-profile.port';

/**
 * Запись имени в Keycloak (Admin API, `PUT /users/{id}`).
 *
 * `PUT` — **полная замена** представления: всё, чего нет в теле, затирается. На живой
 * приёмке это однажды снесло `email`, `firstName` и `lastName` (см. `KeycloakAdminAdapter.updateContacts`).
 * Поэтому читаем текущее представление и переносим его целиком — вместе с `username`,
 * атрибутами и `requiredActions`, — меняя только имя.
 */
@Injectable()
export class KeycloakIdentityProfileAdapter implements IdentityProfilePort {
  private readonly logger = new Logger(KeycloakIdentityProfileAdapter.name);

  constructor(private readonly client: KeycloakAdminClient) {}

  async updateName(params: {
    keycloakId: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<void> {
    const kcShort = params.keycloakId.substring(0, 8);

    let current: Awaited<ReturnType<KeycloakAdminClient['findUserById']>>;
    try {
      current = await this.client.findUserById(params.keycloakId);
    } catch (err) {
      this.logger.warn(
        `profile update: keycloak read failed kc=${kcShort}...: ${describeKeycloakError(err)}`,
      );
      throw new IdentityProfileUnavailableError();
    }

    if (!current) {
      throw new UserNotFoundError(`keycloakId=${params.keycloakId}`);
    }

    // `PUT /users/{id}` — полная замена: переносим всё прочитанное представление, меняем только имя.
    //
    // Почему `''`, а не `null` (batch-5, дефект «пустой профиль» → 400 от Keycloak):
    // в этом реалме `firstName`/`lastName` объявлены как **required для роли `user`**
    // (`GET /admin/realms/{realm}/users/profile` → `required: {"roles":["user"]}`). `null` в теле
    // означает для profile-валидатора «атрибут не задан», и Keycloak отвечает `400`
    // (`error-user-attribute-required`) — при этом ручной `PUT` с пустой строкой проходит `204`.
    // Пустая строка — валидное «пустое» значение и для KC, и для shadow: имя очищается так же,
    // как задумано в контракте (`null` в запросе = очистить).
    const representation: Record<string, unknown> = {
      ...current,
      firstName: nameForWrite(params.firstName, current.firstName),
      lastName: nameForWrite(params.lastName, current.lastName),
    };

    try {
      await this.client.updateUser(params.keycloakId, representation);
    } catch (err) {
      // Диагностика кейса «пустой профиль» (batch-5): без тела ответа Keycloak причина неразбираема —
      // `message` содержит только «Request failed with status code 400». Тело валидации PII не несёт
      // (поля и коды вроде `error-user-attribute-required`), значения имён в лог не попадают.
      this.logger.warn(
        `profile update: keycloak write failed kc=${kcShort}... ` +
          `fields=[${writtenFields(params)}] currentName=[${nameState(current)}]: ` +
          `${describeKeycloakError(err)}`,
      );
      throw new IdentityProfileUnavailableError();
    }
  }
}

/**
 * Значение имени для тела `PUT`: `undefined` — «не трогаем» (берём текущее), `null` — «очистить».
 * В обоих случаях наружу уходит **строка** (пустая вместо `null`), см. комментарий в `updateName`.
 */
function nameForWrite(next: string | null | undefined, current: string | null | undefined): string {
  if (next !== undefined) return next ?? '';
  return current ?? '';
}

/** Какие именно поля имени пишем: `set` / `clear` (значения — PII, в лог не идут). */
function writtenFields(params: { firstName?: string | null; lastName?: string | null }): string {
  const parts: string[] = [];
  if (params.firstName !== undefined)
    parts.push(`firstName=${params.firstName === null ? 'clear' : 'set'}`);
  if (params.lastName !== undefined)
    parts.push(`lastName=${params.lastName === null ? 'clear' : 'set'}`);
  return parts.length > 0 ? parts.join(',') : 'none';
}

/** Состояние имени в Keycloak до записи — без значений. */
function nameState(current: { firstName?: string | null; lastName?: string | null }): string {
  const has = (v?: string | null) => (v === undefined || v === null || v === '' ? 'empty' : 'set');
  return `first=${has(current.firstName)},last=${has(current.lastName)}`;
}

/**
 * Ошибка Keycloak с телом ответа: `status` + `response.data` (обрезано).
 * `axios` кладёт туда `{"error":"error-user-attribute-required", ...}` — без этого кейсы не разбираются.
 */
function describeKeycloakError(err: unknown): string {
  const e = err as { message?: string; response?: { status?: number; data?: unknown } };
  const status = e?.response?.status;
  const data = e?.response?.data;

  let body = '';
  if (data !== undefined) {
    const text = typeof data === 'string' ? data : safeJson(data);
    body = ` body=${text.length > 400 ? `${text.slice(0, 400)}…` : text}`;
  }

  return `${e?.message ?? (err instanceof Error ? err.message : String(err))}${status ? ` [status ${status}]` : ''}${body}`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
