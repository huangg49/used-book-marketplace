import { DomainError } from './domain-error.js';

export function messageBoundary(cursor: string, conversationId: string) {
  const decoded = Buffer.from(cursor, 'base64url');
  const [room, time, id, extra] = decoded.toString('utf8').split('/');
  const sentAt = new Date(time ?? '');
  if (
    decoded.toString('base64url') !== cursor ||
    extra !== undefined ||
    room !== conversationId ||
    !id ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
    !Number.isFinite(sentAt.getTime()) ||
    sentAt.toISOString() !== time
  ) {
    throw new DomainError(
      400,
      'VALIDATION_ERROR',
      'Vị trí lịch sử tin nhắn không hợp lệ.',
    );
  }
  return { sentAt, id };
}
