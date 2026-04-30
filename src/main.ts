import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3001);
  const pathPrefix = config.get<string>('app.pathPrefix')

  if (pathPrefix) app.setGlobalPrefix(pathPrefix);
  await app.listen(port);
  console.log(`App running on http://localhost:${port}/${pathPrefix}`);
}
bootstrap();
