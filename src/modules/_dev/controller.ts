import { Controller, Get } from '@nestjs/common';
import { DevService } from './service';

@Controller('dev') // Все запросы пойдут на /dev
export class DevController {
  constructor(private readonly devService: DevService) {}

  @Get() // Обработает GET /dev
  getAllCats() {
    return this.devService.getCounter();
  }
}