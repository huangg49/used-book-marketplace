import { HttpException } from '@nestjs/common';
import type { components } from '@used-books/api-contract';

export type Wire = components['schemas'];
export class DomainError extends HttpException {
  constructor(
    status: number,
    code: Wire['ListingErrorCode'],
    message: string,
    readonly fieldErrors?: Wire['FieldError'][],
  ) {
    super({ code, message }, status);
  }
}
export const notFound = () =>
  new DomainError(404, 'NOT_FOUND', 'Không tìm thấy nội dung này.');
export const conflict = () =>
  new DomainError(
    409,
    'VersionConflict',
    'Nội dung đã thay đổi. Hãy tải lại trước khi lưu.',
  );
export const invalidState = (message?: string) =>
  new DomainError(
    409,
    'InvalidState',
    message ?? 'Trạng thái hiện tại không cho phép thao tác này.',
  );
export function invalidField(
  path: string,
  message: string,
  code: Wire['FieldError']['code'] = 'Invalid',
): never {
  throw new DomainError(
    422,
    'VALIDATION_ERROR',
    'Kiểm tra lại thông tin đã nhập.',
    [{ path, code, message }],
  );
}
