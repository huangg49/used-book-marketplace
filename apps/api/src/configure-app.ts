import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { parse } from 'yaml';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

export function configureApp(
  app: INestApplication,
  { docs = true, logRequests = true } = {},
) {
  const config = app.get(ConfigService);
  const logger = new Logger('HTTP');
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.enableCors({
    exposedHeaders: ['X-Request-Id', 'Idempotency-Replayed', 'Retry-After'],
    origin: config
      .get<string>(
        'CORS_ORIGINS',
        'http://localhost:5173,http://localhost:8081',
      )
      .split(',')
      .map((origin) => origin.trim()),
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const started = Date.now();
    response.locals.requestId = randomUUID();
    response.setHeader('X-Request-Id', response.locals.requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (logRequests)
      response.on('finish', () =>
        logger.log(
          JSON.stringify({
            requestId: response.locals.requestId,
            method: request.method,
            path: request.path,
            status: response.statusCode,
            durationMs: Date.now() - started,
          }),
        ),
      );
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  if (docs) {
    const require = createRequire(import.meta.url);
    const contract = parse(
      readFileSync(
        require.resolve('@used-books/api-contract/openapi.yaml'),
        'utf8',
      ),
    ) as OpenAPIObject;
    SwaggerModule.setup('docs', app, contract);
  }
}
