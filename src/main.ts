import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3001);
  const pathPrefix = config.get<string>('app.pathPrefix');

  if (pathPrefix) app.setGlobalPrefix(pathPrefix);
  app.useGlobalPipes(new ZodValidationPipe());

  // ---- OpenAPI / Swagger ----
  const swaggerConfig = new DocumentBuilder()
    .setTitle('njs-server API')
    .setDescription(
      'NestJS Modular Monolith (DDD + Hexagonal) with Keycloak auth. ' +
        'See [Developer Guide](https://github.com/ivatutin/njs-server/blob/main/docs/DEVELOPER_GUIDE.md).',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste accessToken from /auth/sign-in',
      },
      'bearer',
    )
    .addServer(pathPrefix ? `/${pathPrefix}` : '/')
    .build();
  // cleanupOpenApiDoc turns Zod DTOs into proper OpenAPI schemas
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig));
  const docsPath = pathPrefix ? `${pathPrefix}/docs` : 'docs';
  SwaggerModule.setup(docsPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  app.get(Logger).log(`App running on http://localhost:${port}/${pathPrefix ?? ''}`);
  app.get(Logger).log(`Swagger UI: http://localhost:${port}/${docsPath}`);
}
bootstrap();
