import { Injectable } from '@nestjs/common';

@Injectable()
export class TestService {
    private counter = 0

    getCounter() {
        return this.counter
    }
    
    increment() {
        return ++this.counter;
    }
}