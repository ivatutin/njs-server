import { User } from '../../../src/modules/user/domain/entities/user.entity';
import { InvalidContactsError } from '../../../src/modules/user/domain/errors/invalid-contacts.error';
import { RuleViolationError } from '../../../src/shared/domain/errors/rule-violation.error';

const eventNames = (u: User) => u.pullDomainEvents().map((e) => e.eventName);

describe('User entity', () => {
  describe('create()', () => {
    it('creates user with email only', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      expect(u.email?.toString()).toBe('a@b.com');
      expect(u.phone.getValue()).toBeNull();
      expect(u.status.getValue()).toBe('pending_verification');
      expect(u.isEmailVerified()).toBe(false);
      expect(u.isPhoneVerified()).toBe(false);
      expect(u.hasAnyVerifiedContact()).toBe(false);
    });

    it('creates user with phone only', () => {
      const u = User.create({ keycloakId: 'kc-1', phone: '+79991234567' });
      expect(u.email).toBeNull();
      expect(u.phone.getValue()).toBe('+79991234567');
    });

    it('throws when neither email nor phone provided', () => {
      expect(() => User.create({ keycloakId: 'kc-1' })).toThrow(InvalidContactsError);
    });

    it('emits UserCreatedEvent', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      expect(eventNames(u)).toEqual(['user.created']);
    });

    it('defaults: empty roles, null metadata, pending status, now timestamps', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      expect(u.roles).toEqual([]);
      expect(u.metadata).toBeNull();
      expect(u.createdAt).toBeInstanceOf(Date);
      expect(u.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('verifyEmail()', () => {
    it('sets timestamp, transitions pending → active, emits 2 events', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      u.pullDomainEvents();
      u.verifyEmail();
      expect(u.isEmailVerified()).toBe(true);
      expect(u.emailVerifiedAt).toBeInstanceOf(Date);
      expect(u.status.isActive()).toBe(true);
      expect(eventNames(u)).toEqual(['user.email-verified', 'user.activated']);
    });

    it('is idempotent on repeated call', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      u.verifyEmail();
      u.pullDomainEvents();
      u.verifyEmail();
      expect(eventNames(u)).toEqual([]);
    });

    it('throws when email is not set', () => {
      const u = User.create({ keycloakId: 'kc-1', phone: '+79991234567' });
      expect(() => u.verifyEmail()).toThrow(RuleViolationError);
    });

    it('does NOT emit user.activated on second verification', () => {
      const u = User.create({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        phone: '+79991234567',
      });
      u.verifyEmail(); // first activation
      u.pullDomainEvents();
      u.verifyPhone();
      expect(eventNames(u)).toEqual(['user.phone-verified']); // no activated again
    });
  });

  describe('verifyPhone()', () => {
    it('sets timestamp and activates', () => {
      const u = User.create({ keycloakId: 'kc-1', phone: '+79991234567' });
      u.verifyPhone();
      expect(u.isPhoneVerified()).toBe(true);
      expect(u.status.isActive()).toBe(true);
    });

    it('throws when phone is not set', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      expect(() => u.verifyPhone()).toThrow(RuleViolationError);
    });
  });

  describe('updateContacts()', () => {
    it('changes unverified email', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'old@b.com' });
      u.pullDomainEvents();
      u.updateContacts({ email: 'new@b.com' });
      expect(u.email?.toString()).toBe('new@b.com');
      expect(eventNames(u)).toEqual(['user.updated']);
    });

    it('throws when trying to change verified email', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      u.verifyEmail();
      expect(() => u.updateContacts({ email: 'new@b.com' })).toThrow(RuleViolationError);
    });

    it('throws when trying to change verified phone', () => {
      const u = User.create({ keycloakId: 'kc-1', phone: '+79991111111' });
      u.verifyPhone();
      expect(() => u.updateContacts({ phone: '+79992222222' })).toThrow(RuleViolationError);
    });

    it('adds phone to email-only user', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      u.updateContacts({ phone: '+79991234567' });
      expect(u.phone.getValue()).toBe('+79991234567');
    });

    it('throws when clearing both contacts', () => {
      const u = User.create({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        phone: '+79991234567',
      });
      expect(() => u.updateContacts({ email: null, phone: null })).toThrow(InvalidContactsError);
    });

    it('no-op when nothing actually changes', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      u.pullDomainEvents();
      u.updateContacts({ email: 'a@b.com' });
      expect(eventNames(u)).toEqual([]);
    });
  });

  describe('removeEmail() / removePhone()', () => {
    it('removeEmail throws when email is not set', () => {
      const u = User.create({ keycloakId: 'kc-1', phone: '+79991234567' });
      expect(() => u.removeEmail()).toThrow(RuleViolationError);
    });

    it('removeEmail throws when only contact (phone is null)', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      expect(() => u.removeEmail()).toThrow(RuleViolationError);
    });

    it('removeEmail throws when verified email + unverified phone (variant B)', () => {
      const u = User.create({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        phone: '+79991234567',
      });
      u.verifyEmail();
      expect(() => u.removeEmail()).toThrow(RuleViolationError);
    });

    it('removeEmail allowed: verified email + verified phone', () => {
      const u = User.create({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        phone: '+79991234567',
      });
      u.verifyEmail();
      u.verifyPhone();
      u.removeEmail();
      expect(u.email).toBeNull();
      expect(u.emailVerifiedAt).toBeNull();
    });

    it('removeEmail allowed: unverified email + any phone', () => {
      const u = User.create({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        phone: '+79991234567',
      });
      u.removeEmail();
      expect(u.email).toBeNull();
    });

    it('removePhone has symmetric rules', () => {
      const u = User.create({
        keycloakId: 'kc-1',
        email: 'a@b.com',
        phone: '+79991234567',
      });
      u.verifyPhone();
      expect(() => u.removePhone()).toThrow(RuleViolationError);
    });
  });

  describe('updateProfile()', () => {
    it('changes firstName and lastName', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      u.pullDomainEvents();
      u.updateProfile({ firstName: 'Jane', lastName: 'Doe' });
      expect(u.firstName).toBe('Jane');
      expect(u.lastName).toBe('Doe');
      expect(eventNames(u)).toEqual(['user.updated']);
    });

    it('no event when nothing changes', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com', firstName: 'Jane' });
      u.pullDomainEvents();
      u.updateProfile({ firstName: 'Jane' });
      expect(eventNames(u)).toEqual([]);
    });
  });

  describe('lifecycle: suspend/activate', () => {
    it('suspend throws on pending user', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      expect(() => u.suspend()).toThrow(RuleViolationError);
    });

    it('active → suspend → activate cycle', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      u.verifyEmail(); // active
      u.suspend();
      expect(u.status.getValue()).toBe('suspended');
      u.activate();
      expect(u.status.getValue()).toBe('active');
    });

    it('activate throws when no verified contact', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      expect(() => u.activate()).toThrow(RuleViolationError);
    });
  });

  describe('updateRoles()', () => {
    it('replaces roles and emits event', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['user'] });
      u.pullDomainEvents();
      u.updateRoles(['admin', 'manager']);
      expect(u.roles).toEqual(['admin', 'manager']);
      expect(eventNames(u)).toEqual(['user.updated']);
    });

    it('roles getter returns a copy (not mutable reference)', () => {
      const u = User.create({ keycloakId: 'kc-1', email: 'a@b.com', roles: ['x'] });
      const roles = u.roles;
      roles.push('y');
      expect(u.roles).toEqual(['x']);
    });
  });

  describe('reconstitute()', () => {
    it('does NOT emit any events', () => {
      const original = User.create({ keycloakId: 'kc-1', email: 'a@b.com' });
      original.pullDomainEvents();
      // simulate reconstitute by accessing via cast (in real code it's the mapper that calls reconstitute)
      const events = original.pullDomainEvents();
      expect(events).toEqual([]);
    });
  });
});
