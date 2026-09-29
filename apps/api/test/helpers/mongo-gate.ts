import type { ClientSession, Db, MongoClient } from 'mongodb';
import { onTransactionRetry } from '../../src/database/mongo/transaction.js';

// MongoDB replacement for the PostgreSQL "hold a row lock, wait until the
// commands are blocked on it" barrier. A gate transaction write-locks a user
// document; commands touching it then conflict and retry (observable), and
// proceed once the gate commits or aborts.
export class Gate {
  private constructor(
    readonly session: ClientSession,
    readonly db: Db,
    private readonly transactions: Set<number>,
    private readonly stop: () => void,
  ) {}

  static lockUser(client: MongoClient, userId: string) {
    return Gate.lock(client, 'users', [userId]);
  }

  // Write-locks any lockable documents (users, listings, catalog_books, ...),
  // like SELECT ... FOR UPDATE on those rows.
  static async lock(client: MongoClient, collection: string, ids: string[]) {
    const transactions = new Set<number>();
    const stop = onTransactionRetry((event) =>
      transactions.add(event.transactionId),
    );
    const session = client.startSession();
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
    const db = client.db();
    for (const id of [...ids].sort())
      await db
        .collection<{ _id: string }>(collection)
        .updateOne({ _id: id }, { $inc: { lockSeq: 1 } }, { session });
    return new Gate(session, db, transactions, stop);
  }

  // Resolves once `n` distinct transactions have retried against a lock.
  async contended(n = 1) {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      if (this.transactions.size >= n) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Commands did not reach the lock barrier');
  }

  async commit() {
    try {
      await this.session.commitTransaction();
    } finally {
      await this.close();
    }
  }
  async close() {
    this.stop();
    if (this.session.inTransaction())
      await this.session.abortTransaction().catch(() => undefined);
    await this.session.endSession();
  }
}
