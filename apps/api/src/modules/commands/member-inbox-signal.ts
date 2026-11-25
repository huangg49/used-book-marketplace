import type { Tx } from '../../database/mongo/transaction.js';

// Same-process wake-up for a member's notification inbox. Writers call it in
// the transaction that inserts or reads notifications; listeners run only after
// that transaction commits. The live gateway still re-reads stored state, and
// its slower fallback check covers another process or a missed signal.
const listeners = new Set<(userId: string) => void>();

export function onMemberInboxChanged(listener: (userId: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function signalMemberInbox(tx: Pick<Tx, 'afterCommit'>, userIds: Iterable<string>) {
  for (const userId of new Set(userIds)) {
    tx.afterCommit(`member-inbox:${userId}`, () => {
      for (const listener of listeners) listener(userId);
    });
  }
}
