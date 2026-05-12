import { AggregateRoot } from '@shared/domain/aggregate-root';
import { UserId } from '../value-objects/user-id.vo';
import { Email } from '../value-objects/email.vo';
import { Phone } from '../value-objects/phone.vo';
import { UserStatus } from '../value-objects/user-status.vo';
import { UserCreatedEvent } from '../events/user-created.event';
import { UserUpdatedEvent } from '../events/user-updated.event';
import { EmailVerifiedEvent } from '../events/email-verified.event';
import { PhoneVerifiedEvent } from '../events/phone-verified.event';
import { UserActivatedEvent } from '../events/user-activated.event';
import { InvalidContactsError } from '../errors/invalid-contacts.error';
import { RuleViolationError } from '@shared/domain/errors/rule-violation.error';

export interface UserProps {
  email: Email | null;
  phone: Phone;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  keycloakId: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  metadata: Record<string, unknown> | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class User extends AggregateRoot<UserId> {
  private _email: Email | null;
  private _phone: Phone;
  private _emailVerifiedAt: Date | null;
  private _phoneVerifiedAt: Date | null;
  private _keycloakId: string;
  private _firstName: string | null;
  private _lastName: string | null;
  private _roles: string[];
  private _metadata: Record<string, unknown> | null;
  private _status: UserStatus;
  private _createdAt: Date;
  private _updatedAt: Date;

  private constructor(id: UserId, props: UserProps) {
    super(id);
    this._email = props.email;
    this._phone = props.phone;
    this._emailVerifiedAt = props.emailVerifiedAt;
    this._phoneVerifiedAt = props.phoneVerifiedAt;
    this._keycloakId = props.keycloakId;
    this._firstName = props.firstName;
    this._lastName = props.lastName;
    this._roles = props.roles;
    this._metadata = props.metadata;
    this._status = props.status;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  /** Фабричный метод — создание нового пользователя (всегда pending_verification) */
  static create(props: {
    email?: string | null;
    phone?: string | null;
    keycloakId: string;
    firstName?: string | null;
    lastName?: string | null;
    roles?: string[];
    metadata?: Record<string, unknown> | null;
  }): User {
    const email = props.email ? Email.create(props.email) : null;
    const phone = Phone.create(props.phone ?? null);

    if (!email && phone.getValue() === null) {
      throw new InvalidContactsError();
    }

    const id = UserId.create();
    const now = new Date();

    const user = new User(id, {
      email,
      phone,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      keycloakId: props.keycloakId,
      firstName: props.firstName ?? null,
      lastName: props.lastName ?? null,
      roles: props.roles ?? [],
      metadata: props.metadata ?? null,
      status: UserStatus.pendingVerification(),
      createdAt: now,
      updatedAt: now,
    });

    user.addDomainEvent(
      new UserCreatedEvent({
        userId: id.toString(),
        email: props.email ?? null,
        keycloakId: props.keycloakId,
      }),
    );

    return user;
  }

  /** Восстановление из БД — без эмита событий */
  static reconstitute(id: UserId, props: UserProps): User {
    return new User(id, props);
  }

  // --- Getters ---
  get email(): Email | null { return this._email; }
  get phone(): Phone { return this._phone; }
  get emailVerifiedAt(): Date | null { return this._emailVerifiedAt; }
  get phoneVerifiedAt(): Date | null { return this._phoneVerifiedAt; }
  get keycloakId(): string { return this._keycloakId; }
  get firstName(): string | null { return this._firstName; }
  get lastName(): string | null { return this._lastName; }
  get roles(): string[] { return [...this._roles]; }
  get metadata(): Record<string, unknown> | null { return this._metadata; }
  get status(): UserStatus { return this._status; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  // --- Verification predicates ---
  isEmailVerified(): boolean {
    return this._emailVerifiedAt !== null;
  }

  isPhoneVerified(): boolean {
    return this._phoneVerifiedAt !== null;
  }

  hasAnyVerifiedContact(): boolean {
    return this.isEmailVerified() || this.isPhoneVerified();
  }

  // --- Business methods ---

  /** Обновление имени/фамилии */
  updateProfile(data: {
    firstName?: string | null;
    lastName?: string | null;
  }): void {
    const changes: string[] = [];

    if (data.firstName !== undefined && data.firstName !== this._firstName) {
      this._firstName = data.firstName;
      changes.push('firstName');
    }
    if (data.lastName !== undefined && data.lastName !== this._lastName) {
      this._lastName = data.lastName;
      changes.push('lastName');
    }

    if (changes.length > 0) {
      this._updatedAt = new Date();
      this.addDomainEvent(
        new UserUpdatedEvent({ userId: this.id.toString(), changes }),
      );
    }
  }

  /**
   * Прямая смена контакта — допустима ТОЛЬКО для не-подтверждённых.
   * Для подтверждённых нужно использовать отдельный flow (PendingEmailChange/PendingPhoneChange).
   */
  updateContacts(data: { email?: string | null; phone?: string | null }): void {
    const newEmail = data.email === undefined
      ? this._email
      : (data.email === null ? null : Email.create(data.email));
    const newPhone = data.phone === undefined
      ? this._phone
      : Phone.create(data.phone);

    if (!newEmail && newPhone.getValue() === null) {
      throw new InvalidContactsError();
    }

    const currentEmailValue = this._email?.getValue() ?? null;
    const newEmailValue = newEmail?.getValue() ?? null;
    const emailChanging = data.email !== undefined && currentEmailValue !== newEmailValue;
    const phoneChanging = data.phone !== undefined && !this._phone.equals(newPhone);

    if (emailChanging && this.isEmailVerified()) {
      throw new RuleViolationError('Cannot directly change verified email, use change request flow');
    }
    if (phoneChanging && this.isPhoneVerified()) {
      throw new RuleViolationError('Cannot directly change verified phone, use change request flow');
    }

    const changes: string[] = [];

    if (emailChanging) {
      this._email = newEmail;
      this._emailVerifiedAt = null;
      changes.push('email');
    }
    if (phoneChanging) {
      this._phone = newPhone;
      this._phoneVerifiedAt = null;
      changes.push('phone');
    }

    if (changes.length > 0) {
      this._updatedAt = new Date();
      this.addDomainEvent(
        new UserUpdatedEvent({ userId: this.id.toString(), changes }),
      );
    }
  }

  /**
   * Удаление email. Запрещено если:
   * - email уже null
   * - phone не задан (нарушит инвариант "хотя бы один контакт")
   * - email подтверждён, а phone не подтверждён (вариант B: не даём пользователю
   *   "разлогиниться" оставив только неподтверждённый контакт)
   */
  removeEmail(): void {
    if (this._email === null) {
      throw new RuleViolationError('Email is not set');
    }
    if (this._phone.getValue() === null) {
      throw new InvalidContactsError('Cannot remove last contact, user must have email or phone');
    }
    if (this.isEmailVerified() && !this.isPhoneVerified()) {
      throw new RuleViolationError('Cannot remove verified contact while only unverified one remains');
    }

    this._email = null;
    this._emailVerifiedAt = null;
    this._updatedAt = new Date();
    this.addDomainEvent(
      new UserUpdatedEvent({ userId: this.id.toString(), changes: ['email'] }),
    );
  }

  /** Удаление phone. Аналогично removeEmail. */
  removePhone(): void {
    if (this._phone.getValue() === null) {
      throw new RuleViolationError('Phone is not set');
    }
    if (this._email === null) {
      throw new InvalidContactsError('Cannot remove last contact, user must have email or phone');
    }
    if (this.isPhoneVerified() && !this.isEmailVerified()) {
      throw new RuleViolationError('Cannot remove verified contact while only unverified one remains');
    }

    this._phone = Phone.create(null);
    this._phoneVerifiedAt = null;
    this._updatedAt = new Date();
    this.addDomainEvent(
      new UserUpdatedEvent({ userId: this.id.toString(), changes: ['phone'] }),
    );
  }

  /** Подтверждение email. Идемпотентно — повторный вызов ничего не делает. */
  verifyEmail(): void {
    if (!this._email) {
      throw new RuleViolationError('Cannot verify email: email is not set');
    }
    if (this._emailVerifiedAt !== null) {
      return;
    }

    this._emailVerifiedAt = new Date();
    this._updatedAt = new Date();
    this.addDomainEvent(
      new EmailVerifiedEvent({
        userId: this.id.toString(),
        email: this._email.toString(),
      }),
    );

    this.activateIfPending();
  }

  /** Подтверждение phone. Идемпотентно — повторный вызов ничего не делает. */
  verifyPhone(): void {
    const phoneValue = this._phone.getValue();
    if (phoneValue === null) {
      throw new RuleViolationError('Cannot verify phone: phone is not set');
    }
    if (this._phoneVerifiedAt !== null) {
      return;
    }

    this._phoneVerifiedAt = new Date();
    this._updatedAt = new Date();
    this.addDomainEvent(
      new PhoneVerifiedEvent({
        userId: this.id.toString(),
        phone: phoneValue,
      }),
    );

    this.activateIfPending();
  }

  /** Перевод в active при первом подтверждении (если был pending_verification) */
  private activateIfPending(): void {
    if (this._status.isPendingVerification()) {
      this._status = UserStatus.active();
      this.addDomainEvent(
        new UserActivatedEvent({ userId: this.id.toString() }),
      );
    }
  }

  suspend(): void {
    if (!this._status.isActive()) {
      throw new RuleViolationError('Can only suspend active users');
    }
    this._status = UserStatus.create('suspended');
    this._updatedAt = new Date();
    this.addDomainEvent(
      new UserUpdatedEvent({ userId: this.id.toString(), changes: ['status'] }),
    );
  }

  activate(): void {
    if (!this.hasAnyVerifiedContact()) {
      throw new RuleViolationError('Cannot activate user without any verified contact');
    }
    this._status = UserStatus.active();
    this._updatedAt = new Date();
    this.addDomainEvent(
      new UserUpdatedEvent({ userId: this.id.toString(), changes: ['status'] }),
    );
  }

  updateRoles(roles: string[]): void {
    this._roles = [...roles];
    this._updatedAt = new Date();
    this.addDomainEvent(
      new UserUpdatedEvent({ userId: this.id.toString(), changes: ['roles'] }),
    );
  }
}
