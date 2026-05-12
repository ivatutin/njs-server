import { UserStatus } from '../../../src/modules/user/domain/value-objects/user-status.vo';
import { RuleViolationError } from '../../../src/shared/domain/errors/rule-violation.error';

describe('UserStatus', () => {
  it.each(['pending_verification', 'active', 'suspended', 'deleted'] as const)(
    'accepts valid status: %s',
    (v) => {
      expect(UserStatus.create(v).getValue()).toBe(v);
    },
  );

  it('rejects unknown status', () => {
    expect(() => UserStatus.create('banana' as never)).toThrow(RuleViolationError);
  });

  it('pendingVerification() factory', () => {
    const s = UserStatus.pendingVerification();
    expect(s.getValue()).toBe('pending_verification');
    expect(s.isPendingVerification()).toBe(true);
    expect(s.isActive()).toBe(false);
  });

  it('active() factory', () => {
    const s = UserStatus.active();
    expect(s.isActive()).toBe(true);
    expect(s.isPendingVerification()).toBe(false);
  });

  it('predicates work for suspended', () => {
    const s = UserStatus.create('suspended');
    expect(s.isActive()).toBe(false);
    expect(s.isPendingVerification()).toBe(false);
  });
});
