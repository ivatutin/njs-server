import { AggregateRoot } from '@shared/domain/aggregate-root';
import { UserId } from '../value-objects/user-id.vo';
import { Email } from '../value-objects/email.vo';
import { Phone } from '../value-objects/phone.vo';
import { UserStatus } from '../value-objects/user-status.vo';
import { UserCreatedEvent } from '../events/user-created.event';
import { UserUpdatedEvent } from '../events/user-updated.event';

export interface UserProps {
  email: Email | null;
  keycloakId: string;
  firstName: string | null;
  lastName: string | null;
  phone: Phone;
  roles: string[];
  metadata: Record<string, unknown> | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class User extends AggregateRoot<UserId> {
  private _email: Email | null;
  private _keycloakId: string;
  private _firstName: string | null;
  private _lastName: string | null;
  private _phone: Phone;
  private _roles: string[];
  private _metadata: Record<string, unknown> | null;
  private _status: UserStatus;
  private _createdAt: Date;
  private _updatedAt: Date;

  private constructor(id: UserId, props: UserProps) {
    super(id);
    this._email = props.email;
    this._keycloakId = props.keycloakId;
    this._firstName = props.firstName;
    this._lastName = props.lastName;
    this._phone = props.phone;
    this._roles = props.roles;
    this._metadata = props.metadata;
    this._status = props.status;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  /** Фабричный метод — создание нового пользователя */
  static create(props: {
    email?: string | null;
    keycloakId: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    roles?: string[];
    metadata?: Record<string, unknown> | null;
  }): User {
    const email = props.email ? Email.create(props.email) : null;
    const phone = Phone.create(props.phone ?? null);

    if (!email && phone.getValue() === null) {
      throw new Error('User must have email or phone');
    }

    const id = UserId.create();
    const now = new Date();

    const user = new User(id, {
      email,
      keycloakId: props.keycloakId,
      firstName: props.firstName ?? null,
      lastName: props.lastName ?? null,
      phone,
      roles: props.roles ?? [],
      metadata: props.metadata ?? null,
      status: UserStatus.active(),
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
  get keycloakId(): string { return this._keycloakId; }
  get firstName(): string | null { return this._firstName; }
  get lastName(): string | null { return this._lastName; }
  get phone(): Phone { return this._phone; }
  get roles(): string[] { return [...this._roles]; }
  get metadata(): Record<string, unknown> | null { return this._metadata; }
  get status(): UserStatus { return this._status; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  // --- Business methods ---
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

  /** Смена контактов с проверкой инварианта "хотя бы один заполнен" */
  updateContacts(data: { email?: string | null; phone?: string | null }): void {
    const newEmail = data.email === undefined
      ? this._email
      : (data.email === null ? null : Email.create(data.email));
    const newPhone = data.phone === undefined
      ? this._phone
      : Phone.create(data.phone);

    if (!newEmail && newPhone.getValue() === null) {
      throw new Error('User must have email or phone');
    }

    const changes: string[] = [];
    const currentEmailValue = this._email?.getValue() ?? null;
    const newEmailValue = newEmail?.getValue() ?? null;

    if (data.email !== undefined && currentEmailValue !== newEmailValue) {
      this._email = newEmail;
      changes.push('email');
    }
    if (data.phone !== undefined && !this._phone.equals(newPhone)) {
      this._phone = newPhone;
      changes.push('phone');
    }

    if (changes.length > 0) {
      this._updatedAt = new Date();
      this.addDomainEvent(
        new UserUpdatedEvent({ userId: this.id.toString(), changes }),
      );
    }
  }

  suspend(): void {
    if (!this._status.isActive()) {
      throw new Error('Can only suspend active users');
    }
    this._status = UserStatus.create('suspended');
    this._updatedAt = new Date();
    this.addDomainEvent(
      new UserUpdatedEvent({ userId: this.id.toString(), changes: ['status'] }),
    );
  }

  activate(): void {
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
