import { ValueObject } from '@shared/domain/value-object';

export type UserStatusType = 'pending_verification' | 'active' | 'suspended' | 'deleted';

export class UserStatus extends ValueObject<UserStatusType> {
  private constructor(value: UserStatusType) {
    super(value);
  }

  static create(value: UserStatusType): UserStatus {
    const allowed: UserStatusType[] = ['pending_verification', 'active', 'suspended', 'deleted'];
    if (!allowed.includes(value)) {
      throw new Error(`Invalid user status: ${value}`);
    }
    return new UserStatus(value);
  }

  static pendingVerification(): UserStatus {
    return new UserStatus('pending_verification');
  }

  static active(): UserStatus {
    return new UserStatus('active');
  }

  isPendingVerification(): boolean {
    return this.value === 'pending_verification';
  }

  isActive(): boolean {
    return this.value === 'active';
  }

  toString(): string {
    return this.value;
  }
}
