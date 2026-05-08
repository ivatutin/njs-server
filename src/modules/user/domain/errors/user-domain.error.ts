/** Базовый класс для всех доменных ошибок модуля User. */
export abstract class UserDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
