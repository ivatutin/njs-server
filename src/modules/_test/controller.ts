import { Controller, Get } from '@nestjs/common';
import { TestService } from './service';
import { DevService } from '@modules/_dev'

@Controller('test') // Все запросы пойдут на /test
export class TestController {
  constructor(
    private readonly testService: TestService,
    private readonly devService: DevService
  ) {

  }

  @Get() // Обработает GET /test
  getAllCats() {
    return this.testService.getCounter();
  }

  @Get('increment')
  increment() {
    return this.testService.increment()
  }

  @Get('sum')
  sum() {
    return this.devService.sum(1, 3)
  }
}