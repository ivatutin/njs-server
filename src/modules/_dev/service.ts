import { Injectable } from '@nestjs/common';

@Injectable()
export class DevService {
  private counter = 0;

  getCounter() {
    return this.counter;
  }

  increment() {
    return ++this.counter;
  }

  sum(a: number, b: number) {
    return a + b;
  }
}
