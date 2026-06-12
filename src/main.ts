import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: { level: process.env.LOG_LEVEL ?? 'info' } }),
  );

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(
    new CorrelationIdInterceptor(),
    new TransformInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Feature Flag Service')
    .setDescription(
      'Multi-tenant feature flag and remote config service. ' +
        'Authenticate with a Bearer API key returned on tenant creation.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('tenants', 'Tenant management')
    .addTag('flags', 'Feature flag CRUD and per-environment configuration')
    .addTag('evaluation', 'Flag evaluation for end-users')
    .addTag('audit', 'Change history')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
