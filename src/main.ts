import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3001);
  const pathPrefix = config.get<string>('app.pathPrefix')

  if (pathPrefix) app.setGlobalPrefix(pathPrefix);
  app.useGlobalPipes(new ZodValidationPipe());

  await app.listen(port);
  console.log(`App running on http://localhost:${port}/${pathPrefix}`);
}
bootstrap();
