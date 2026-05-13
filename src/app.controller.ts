import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './modules/auth/interfaces/http/decorators/public.decorator';

@ApiTags('Root')
@Controller()
export class AppController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Smoke endpoint', description: 'Returns plain "Hello World".' })
  getHello(): string {
    return 'Hello World';
  }
}
