import { HttpException, Logger, type ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { DomainError } from '../modules/commands/domain-error.js';
describe('AI terminal failure is the only exposed server error code', () => {
  it.each([
    [
      new DomainError(503, 'AI_ASSIST_FAILED', 'private internal reason'),
      'AI_ASSIST_FAILED',
    ],
    [new DomainError(503, 'UNAVAILABLE', 'commit unknown'), 'UNAVAILABLE'],
    [
      new HttpException(
        { code: 'AI_ASSIST_FAILED', message: 'untrusted' },
        503,
      ),
      'UNAVAILABLE',
    ],
    [new Error('private internal reason'), 'INTERNAL_ERROR'],
  ])('keeps unrelated server exceptions generic %#', (error, code) => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const json = vi.fn(),
      status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, locals: { requestId: 'qa-request' } }),
        getRequest: () => ({ method: 'POST', path: '/api/v1/qa' }),
      }),
    } as unknown as ArgumentsHost;
    try {
      new ApiExceptionFilter().catch(error, host);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          code,
          message: 'Dịch vụ tạm thời không khả dụng.',
        }),
      );
      expect(JSON.stringify(json.mock.calls)).not.toContain(
        'private internal reason',
      );
    } finally {
      log.mockRestore();
    }
  });
});
