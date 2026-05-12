import { Controller, Get } from '@nestjs/common';
import { DevService } from './service';
import { Public } from '@modules/auth/interfaces/http/decorators/public.decorator';

@Controller('dev') // Все запросы пойдут на /dev
@Public()
export class DevController {
  constructor(private readonly devService: DevService) {}

  @Get() // Обработает GET /dev
  getAllCats() {
    return this.devService.getCounter();
  }
}
