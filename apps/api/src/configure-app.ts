import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { parse } from 'yaml';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { parseCorsOrigins } from './common/socket-cors.js';

export function resolveTrustProxy(
  trustProxyEnv?: string,
  allowRemoteDemo?: string,
  nodeEnv?: string,
): boolean | number | string | undefined {
  const raw = (trustProxyEnv ?? '').trim();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw) return raw;
  if (allowRemoteDemo === 'true' || nodeEnv === 'production') return 1;
  return undefined;
}

export function configureApp(
  app: INestApplication,
  { docs = true, logRequests = true } = {},
) {
  const config = app.get(ConfigService);
  const logger = new Logger('HTTP');
  const trustProxy = resolveTrustProxy(
    config.get<string>('TRUST_PROXY'),
    config.get<string>('DEMO_ALLOW_REMOTE_HOST'),
    config.get<string>('NODE_ENV'),
  );
  if (trustProxy !== undefined) {
    const http = app.getHttpAdapter().getInstance() as {
      set?: (key: string, value: unknown) => void;
    };
    http.set?.('trust proxy', trustProxy);
  }
  app.setGlobalPrefix('api/v1');
  // Windows cannot re-raise every POSIX signal after Nest finishes its hooks.
  // Keep normal signal exit semantics on POSIX.
  app.enableShutdownHooks(undefined, {
    useProcessExit: process.platform === 'win32',
  });
  app.enableCors({
    exposedHeaders: ['X-Request-Id', 'Idempotency-Replayed', 'Retry-After', 'Server-Timing'],
    origin: parseCorsOrigins(config.get<string>('CORS_ORIGINS')),
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
