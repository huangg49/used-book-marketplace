import type { Tx } from '../../database/mongo/transaction.js';
import { DomainError } from './domain-error.js';

export const MESSAGE_MAX_LENGTH = 2000;
const MESSAGES_PER_MINUTE = 20;

// The caller already holds the actor's user lock through MongoCommandService.
// This makes one quota apply across rooms, sessions and both chat transports.
export async function checkMessageSendRate(
  tx: Tx,
  senderId: string,
  now: Date,
) {
  const recent = {
    senderId,
    sentAt: { $gt: new Date(now.getTime() - 60_000) },
  };
  const purchases = await tx.c.purchase_messages.countDocuments(recent, {
    limit: MESSAGES_PER_MINUTE,
  });
  const remaining = MESSAGES_PER_MINUTE - purchases;
  if (
    remaining <= 0 ||
    (await tx.c.exchange_messages.countDocuments(
      { ...recent, memberAuthored: true },
      { limit: remaining },
    )) >= remaining
  ) {
    throw new DomainError(
      429,
      'RATE_LIMITED',
      'Bạn đã gửi 20 tin trong một phút. Hãy chờ một chút rồi gửi lại.',
    );
  }
}
