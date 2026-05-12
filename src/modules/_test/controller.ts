import { Controller, Get } from '@nestjs/common';
import { TestService } from './service';
import { DevService } from '@modules/_dev';
import { Public } from '@modules/auth/interfaces/http/decorators/public.decorator';

@Controller('test') // Все запросы пойдут на /test
@Public()
export class TestController {
  constructor(
    private readonly testService: TestService,
    private readonly devService: DevService,
  ) {}

  @Get() // Обработает GET /test
  getAllCats() {
    return this.testService.getCounter();
  }

  @Get('increment')
  increment() {
    return this.testService.increment();
  }

  @Get('sum')
  sum() {
    return this.devService.sum(1, 3);
  }
}
