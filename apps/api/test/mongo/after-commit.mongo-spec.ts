import { randomUUID } from 'node:crypto';
import { MongoClient, MongoError } from 'mongodb';
import { runTransaction } from '../../src/database/mongo/transaction.js';
import {
  onMemberInboxChanged,
  signalMemberInbox,
} from '../../src/modules/commands/member-inbox-signal.js';

// Tx.afterCommit is a wake-up hint for live screens. It must fire only for the
// attempt that committed, never for an aborted or retried attempt.

const client = new MongoClient(process.env.MONGO_TEST_URL!);
const collection = `after_commit_probe_${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await client.connect();
  await client.db().createCollection(collection);
});

afterAll(async () => {
  await client.db().collection(collection).drop().catch(() => undefined);
  await client.close();
});

const transient = () => {
  const error = new MongoError('simulated write conflict');
  error.addErrorLabel('TransientTransactionError');
  return error;
};

describe('Tx.afterCommit', () => {
  it('runs once after commit, after the write is visible outside the session', async () => {
    const id = randomUUID();
    const seen: unknown[] = [];
    await runTransaction(client, client.db(), async (tx) => {
      await tx.db.collection(collection).insertOne({ _id: id } as never, { session: tx.session });
      tx.afterCommit('probe', () => seen.push('first'));
      tx.afterCommit('probe', () => seen.push('replaced'));
    });
    expect(seen).toEqual(['replaced']);
    expect(await client.db().collection(collection).countDocuments({ _id: id } as never)).toBe(1);
  });

  it('does not run for an aborted transaction', async () => {
    const hook = vi.fn();
    await expect(
      runTransaction(client, client.db(), async (tx) => {
        tx.afterCommit('probe', hook);
        throw new Error('business rule rejected');
      }),
    ).rejects.toThrow('business rule rejected');
    expect(hook).not.toHaveBeenCalled();
  });

  it('runs only the hooks of the attempt that committed after a transient retry', async () => {
    const attempts: number[] = [];
    let attempt = 0;
    await runTransaction(client, client.db(), async (tx) => {
      const current = ++attempt;
      tx.afterCommit(`attempt:${current}`, () => attempts.push(current));
      if (current === 1) throw transient();
    });
    expect(attempts).toEqual([2]);
  });

  it('keeps the committed result when a listener throws', async () => {
    const result = await runTransaction(client, client.db(), async (tx) => {
      tx.afterCommit('broken', () => {
        throw new Error('listener failed');
      });
      return 'committed';
    });
    expect(result).toBe('committed');
  });

  it('signals each member inbox once per committed transaction', async () => {
    const received: string[] = [];
    const stop = onMemberInboxChanged((userId) => received.push(userId));
    try {
      const [a, b] = [randomUUID(), randomUUID()];
      await runTransaction(client, client.db(), async (tx) => {
        signalMemberInbox(tx, [a, b, a]);
        signalMemberInbox(tx, [b]);
        expect(received).toEqual([]);
      });
      expect(received.sort()).toEqual([a, b].sort());
    } finally {
      stop();
    }
  });
});
