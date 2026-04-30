import { ValueObject } from '@shared/domain/value-object';

export type UserStatusType = 'active' | 'suspended' | 'deleted';

export class UserStatus extends ValueObject<UserStatusType> {
  private constructor(value: UserStatusType) {
    super(value);
  }

  static create(value: UserStatusType): UserStatus {
    const allowed: UserStatusType[] = ['active', 'suspended', 'deleted'];
    if (!allowed.includes(value)) {
      throw new Error(`Invalid user status: ${value}`);
    }
    return new UserStatus(value);
  }

  static active(): UserStatus {
    return new UserStatus('active');
  }

  isActive(): boolean {
    return this.value === 'active';
  }

  toString(): string {
    return this.value;
  }
}
