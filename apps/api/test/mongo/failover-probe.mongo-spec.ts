import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { deferred, ProbeStore } from './probe-command.js';

// Requires the three-member `failover` Compose profile. Skipped without
// MONGO_FAILOVER_URL so a single-node run can never report failover PASS.
const url = process.env.MONGO_FAILOVER_URL;

describe.skipIf(!url)('primary election (three-member replica set)', () => {
  const client = new MongoClient(url ?? 'mongodb://unused');
  let store: ProbeStore;

  beforeAll(async () => {
    await client.connect();
    store = new ProbeStore(client, client.db());
    await store.db.dropDatabase();
    await store.ensureSchema();
  });
  afterAll(async () => {
    await store.db.dropDatabase();
    await client.close();
  });

  async function primaryPort() {
    const hello = await client.db('admin').command({ hello: 1 });
    return String(hello.primary);
  }

  it('step-down in the middle of a command: retried on the new primary with one effect', async () => {
    const userId = randomUUID(),
      sessionId = randomUUID(),
      bookId = randomUUID();
    await store
      .users()
      .insertOne(
        { _id: userId, status: 'ACTIVE', roles: ['MEMBER'], lockSeq: 0 },
        { writeConcern: { w: 'majority' } },
      );
    await store.sessions().insertOne(
      {
        _id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 3_600_000),
        lockSeq: 0,
      },
      { writeConcern: { w: 'majority' } },
    );
    await store.books().insertOne(
      {
        _id: bookId,
        state: 'Available',
        version: 1,
        deadline: null,
        lockSeq: 0,
      },
      { writeConcern: { w: 'majority' } },
    );
    const before = await primaryPort();
    const paused = deferred(),
      release = deferred();
    const attempts: number[] = [];
    const command = store.commitBook(
      { userId, sessionId, key: randomUUID() },
      { bookId, expectedVersion: 1 },
      {
        at: async (point, attempt) => {
          if (point === 'afterEffect' && attempt === 1) {
            paused.resolve();
            await release.promise;
          }
        },
        options: { maxAttempts: 10, onAttempt: (n) => void attempts.push(n) },
      },
    );
    await paused.promise;
    // Step-down aborts the open transaction on the old primary.
    const direct = new MongoClient(
      `mongodb://${before}/?directConnection=true`,
    );
    await direct.connect();
    await direct
      .db('admin')
      .command({ replSetStepDown: 30, secondaryCatchUpPeriodSecs: 5 })
      .catch(() => undefined);
    await direct.close();
    release.resolve();
    const result = await command;
    const after = await primaryPort();
    expect(after).not.toBe(before);
    expect(result.replayed).toBe(false);
    expect(attempts.length).toBeGreaterThan(1);
    const majority = { readConcern: { level: 'majority' as const } };
    expect(await store.commitments().countDocuments({}, majority)).toBe(1);
    expect(await store.receipts().countDocuments({}, majority)).toBe(1);
    expect(await store.outbox().countDocuments({}, majority)).toBe(1);
  });
});
