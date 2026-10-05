import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../modules/commands/domain-error.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const detail =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {};
    const codes: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      429: 'RATE_LIMITED',
      503: 'UNAVAILABLE',
    };
    const message =
      status >= 500
        ? 'Dịch vụ tạm thời không khả dụng.'
        : typeof detail.message === 'string'
          ? detail.message
          : Array.isArray(detail.message)
            ? 'Dữ liệu gửi lên không hợp lệ.'
            : 'Yêu cầu không hợp lệ.';
    if (status >= 500) {
      // Raw database exceptions may contain credentials or user data.
      this.logger.error(
        JSON.stringify({
          requestId: response.locals.requestId,
          method: request.method,
          path: request.path,
          status,
          error: exception instanceof Error ? exception.message : 'Unknown error',
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }
    response.status(status).json({
      statusCode: status,
      code:
        typeof detail.code === 'string' && status < 500
          ? detail.code
          : (codes[status] ?? 'INTERNAL_ERROR'),
      message,
      requestId: response.locals.requestId,
      ...(exception instanceof DomainError &&
      status === 422 &&
      exception.fieldErrors
        ? { fieldErrors: exception.fieldErrors }
        : {}),
    });
  }
}
