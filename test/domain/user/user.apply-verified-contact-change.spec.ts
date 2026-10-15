import { User, UserProps } from '../../../src/modules/user/domain/entities/user.entity';
import { UserId } from '../../../src/modules/user/domain/value-objects/user-id.vo';
import { Email } from '../../../src/modules/user/domain/value-objects/email.vo';
import { Phone } from '../../../src/modules/user/domain/value-objects/phone.vo';
import { UserStatus } from '../../../src/modules/user/domain/value-objects/user-status.vo';
import { InvalidContactsError } from '../../../src/modules/user/domain/errors/invalid-contacts.error';
import { EmailVerifiedEvent } from '../../../src/modules/user/domain/events/email-verified.event';
import { PhoneVerifiedEvent } from '../../../src/modules/user/domain/events/phone-verified.event';
import { UserUpdatedEvent } from '../../../src/modules/user/domain/events/user-updated.event';
import { UserActivatedEvent } from '../../../src/modules/user/domain/events/user-activated.event';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-15T12:00:00.000Z');

/** Пользователь с двумя подтверждёнными контактами — базовый сценарий смены. */
function build(overrides: Partial<UserProps> = {}): User {
  return User.reconstitute(UserId.fromString(ID), {
    email: Email.create('old@example.com'),
    phone: Phone.create('+79990000106'),
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    keycloakId: 'kc-1',
    handle: 'usr_0123456789abcdef',
    firstName: null,
    lastName: null,
    roles: [],
    metadata: null,
    status: UserStatus.create('active'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

describe('User.applyVerifiedContactChange (санкционированная смена контакта, ADR-0017 ред. 2)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('заменяет подтверждённый email, подтверждает его сразу и не трогает телефон', () => {
    const user = build();
    user.pullDomainEvents();

    user.applyVerifiedContactChange({ email: 'new@example.com' });

    expect(user.email?.getValue()).toBe('new@example.com');
    expect(user.emailVerifiedAt?.toISOString()).toBe(NOW.toISOString());
    expect(user.phone.getValue()).toBe('+79990000106');
    expect(user.phoneVerifiedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(user.updatedAt.toISOString()).toBe(NOW.toISOString());

    const events = user.pullDomainEvents();
    expect(events.some((e) => e instanceof EmailVerifiedEvent)).toBe(true);
    expect(events.some((e) => e instanceof UserUpdatedEvent)).toBe(true);
    expect(events.some((e) => e instanceof PhoneVerifiedEvent)).toBe(false);
  });

  it('заменяет подтверждённый телефон и не трогает email', () => {
    const user = build();
    user.pullDomainEvents();

    user.applyVerifiedContactChange({ phone: '+79990000107' });

    expect(user.phone.getValue()).toBe('+79990000107');
    expect(user.phoneVerifiedAt?.toISOString()).toBe(NOW.toISOString());
    expect(user.email?.getValue()).toBe('old@example.com');
    expect(user.emailVerifiedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');

    const events = user.pullDomainEvents();
    expect(events.some((e) => e instanceof PhoneVerifiedEvent)).toBe(true);
    expect(events.some((e) => e instanceof UserUpdatedEvent)).toBe(true);
  });

  it('идемпотентен: повторная смена тем же значением не даёт событий и не двигает updatedAt', () => {
    const user = build();
    user.applyVerifiedContactChange({ email: 'new@example.com' });
    user.pullDomainEvents();
    const updatedAt = user.updatedAt;

    user.applyVerifiedContactChange({ email: 'new@example.com' });

    expect(user.pullDomainEvents()).toHaveLength(0);
    expect(user.updatedAt).toBe(updatedAt);
    expect(user.emailVerifiedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it('переводит pending_verification в active (первое подтверждённое владение)', () => {
    const user = build({
      email: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      status: UserStatus.create('pending_verification'),
    });

    user.applyVerifiedContactChange({ email: 'first@example.com' });

    expect(user.status.getValue()).toBe('active');
    expect(user.pullDomainEvents().some((e) => e instanceof UserActivatedEvent)).toBe(true);
  });

  it('не «оживляет» suspended-пользователя', () => {
    const user = build({ status: UserStatus.create('suspended') });

    user.applyVerifiedContactChange({ email: 'new@example.com' });

    expect(user.status.getValue()).toBe('suspended');
    expect(user.pullDomainEvents().some((e) => e instanceof UserActivatedEvent)).toBe(false);
  });

  it('требует ровно один канал: и два, и ни одного — InvalidContacts', () => {
    expect(() => build().applyVerifiedContactChange({})).toThrow(InvalidContactsError);
    expect(() =>
      build().applyVerifiedContactChange({ email: 'new@example.com', phone: '+79990000107' }),
    ).toThrow(InvalidContactsError);
  });

  it('выставляет email на phone-only пользователе (email был null)', () => {
    const user = build({ email: null, emailVerifiedAt: null });

    user.applyVerifiedContactChange({ email: 'added@example.com' });

    expect(user.email?.getValue()).toBe('added@example.com');
    expect(user.emailVerifiedAt?.toISOString()).toBe(NOW.toISOString());
  });
});
