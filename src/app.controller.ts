import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/interfaces/http/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  getHello(): string {
    return 'Hello World';
  }
}
