import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import {
  CommitOutcomeUnknownError,
  TransactionBusyError,
} from '../../src/database/mongo/transaction.js';
import { DomainError } from '../../src/modules/commands/domain-error.js';
import { deferred, ProbeStore, type ProbeContext } from './probe-command.js';

// MIG-01 barrier tests. Ordering is forced with promises and observed retries,
// never with sleeps; the only clock wait polls the server clock for a deadline.

const client = new MongoClient(process.env.MONGO_TEST_URL!);
let store: ProbeStore;

const code = (error: unknown) =>
  error instanceof DomainError
    ? (error.getResponse() as { code: string }).code
    : String(error);

async function serverTime() {
  const [row] = await store.db
    .aggregate<{ now: Date }>([
      { $documents: [{}] },
      { $project: { _id: 0, now: '$$NOW' } },
    ])
    .toArray();
  return row.now;
}

async function member(roles = ['MEMBER']): Promise<ProbeContext> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await store
    .users()
    .insertOne({ _id: userId, status: 'ACTIVE', roles, lockSeq: 0 });
  await store.sessions().insertOne({
    _id: sessionId,
    userId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    lockSeq: 0,
  });
  return { userId, sessionId, key: randomUUID() };
}

async function book(deadline: Date | null = null) {
  const id = randomUUID();
  await store
    .books()
    .insertOne({
      _id: id,
      state: 'Available',
      version: 1,
      deadline,
      lockSeq: 0,
    });
  return id;
}

async function effects() {
  return {
    commitments: await store.commitments().countDocuments(),
    receipts: await store.receipts().countDocuments(),
    audit: await store.audit().countDocuments(),
    outbox: await store.outbox().countDocuments(),
  };
}

const generous = { maxAttempts: 40 };

beforeAll(async () => {
  await client.connect();
  store = new ProbeStore(client, client.db());
  await store.db.dropDatabase();
  await store.ensureSchema();
});
beforeEach(async () => {
  for (const name of ProbeStore.collections)
    await store.db.collection(name).deleteMany({});
});
afterAll(async () => {
  await store.db.dropDatabase();
  await client.close();
});

describe('idempotency key', () => {
  it('same key and body racing produce one effect and one replay', async () => {
    const ctx = await member();
    const bookId = await book();
    const holding = deferred(),
      secondRetried = deferred();
    const first = store.commitBook(
      ctx,
      { bookId, expectedVersion: 1 },
      {
        at: async (point, attempt) => {
          if (point === 'afterReceipt' && attempt === 1) {
            holding.resolve();
            await secondRetried.promise;
          }
        },
        options: generous,
      },
    );
    // The second request starts only once the first holds the key lock.
    await holding.promise;
    const second = store.commitBook(
      ctx,
      { bookId, expectedVersion: 1 },
      {
        options: {
          ...generous,
          onAttempt: (n) => {
            if (n === 2) secondRetried.resolve();
          },
        },
      },
    );
    const [a, b] = await Promise.all([first, second]);
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.receipt).toEqual(a.receipt);
    expect(await effects()).toEqual({
      commitments: 1,
      receipts: 1,
      audit: 1,
      outbox: 1,
    });
    expect((await store.books().findOne({ _id: bookId }))!.version).toBe(2);
  });

  it('same key with a different body conflicts, sequentially and racing', async () => {
    const ctx = await member();
    const bookId = await book();
    await store.commitBook(ctx, { bookId, expectedVersion: 1 });
    await expect(
      store.commitBook(ctx, { bookId, expectedVersion: 2 }),
    ).rejects.toSatisfy((e) => code(e) === 'IdempotencyConflict');

    const other = await book();
    const racing = { ...ctx, key: randomUUID() };
    const holding = deferred(),
      secondRetried = deferred();
    const first = store.commitBook(
      racing,
      { bookId: other, expectedVersion: 1 },
      {
        at: async (point, attempt) => {
          if (point === 'afterAudit' && attempt === 1) {
            holding.resolve();
            await secondRetried.promise;
          }
        },
        options: generous,
      },
    );
    await holding.promise;
    const second = store
      .commitBook(
        racing,
        { bookId: other, expectedVersion: 9 },
        {
          options: {
            ...generous,
            onAttempt: (n) => {
              if (n === 2) secondRetried.resolve();
            },
          },
        },
      )
      .then(
        () => 'ok',
        (e) => code(e),
      );
    expect((await first).replayed).toBe(false);
    expect(await second).toBe('IdempotencyConflict');
    expect((await effects()).commitments).toBe(2);
  });
});

describe('competing actors', () => {
  it('two members racing for one book: exactly one wins', async () => {
    const [u1, u2] = [await member(), await member()];
    const bookId = await book();
    const holding = deferred(),
      loserRetried = deferred();
    const winner = store.commitBook(
      u1,
      { bookId, expectedVersion: 1 },
      {
        at: async (point, attempt) => {
          if (point === 'afterLocks' && attempt === 1) {
            holding.resolve();
            await loserRetried.promise;
          }
        },
        options: generous,
      },
    );
    await holding.promise;
    const loser = store
      .commitBook(
        u2,
        { bookId, expectedVersion: 1 },
        {
          options: {
            ...generous,
            onAttempt: (n) => {
              if (n === 2) loserRetried.resolve();
            },
          },
        },
      )
      .then(
        () => 'ok',
        (e) => code(e),
      );
    expect((await winner).replayed).toBe(false);
    expect(await loser).toBe('VersionConflict');
    const active = await store.commitments().find({ active: true }).toArray();
    expect(active).toHaveLength(1);
    expect(active[0].userId).toBe(u1.userId);
  });

  it('the partial unique index rejects a second active commitment', async () => {
    const bookId = await book();
    await store
      .commitments()
      .insertOne({ _id: randomUUID(), bookId, userId: 'a', active: true });
    await store
      .commitments()
      .insertOne({ _id: randomUUID(), bookId, userId: 'b', active: false });
    await expect(
      store
        .commitments()
        .insertOne({ _id: randomUUID(), bookId, userId: 'c', active: true }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('authorization against concurrent writers', () => {
  it('role removed while the command waits: retry sees current role and denies', async () => {
    const ctx = await member();
    const bookId = await book();
    const paused = deferred(),
      release = deferred();
    const command = store
      .commitBook(
        ctx,
        { bookId, expectedVersion: 1 },
        {
          at: async (point, attempt) => {
            if (point === 'beforeUserLock' && attempt === 1) {
              paused.resolve();
              await release.promise;
            }
          },
          options: generous,
        },
      )
      .then(
        () => 'ok',
        (e) => code(e),
      );
    await paused.promise;
    await store.removeRole(ctx.userId, 'MEMBER');
    release.resolve();
    expect(await command).toBe('FORBIDDEN');
    expect(await effects()).toEqual({
      commitments: 0,
      receipts: 0,
      audit: 0,
      outbox: 0,
    });
  });

  it('negative control: a snapshot read without locking lets a stale role through', async () => {
    const ctx = await member();
    const bookId = await book();
    const paused = deferred(),
      release = deferred();
    const command = store.commitBook(
      ctx,
      { bookId, expectedVersion: 1 },
      {
        authorizeByReadOnly: true,
        at: async (point, attempt) => {
          if (point === 'beforeUserLock' && attempt === 1) {
            paused.resolve();
            await release.promise;
          }
        },
        options: generous,
      },
    );
    await paused.promise;
    await store.removeRole(ctx.userId, 'MEMBER');
    release.resolve();
    // This is the unsafe behaviour the lock protocol exists to prevent.
    expect((await command).replayed).toBe(false);
    expect((await store.users().findOne({ _id: ctx.userId }))!.roles).toEqual(
      [],
    );
  });

  it('session revoked before the lock: the command is rejected as expired', async () => {
    const ctx = await member();
    const bookId = await book();
    const paused = deferred(),
      release = deferred();
    const command = store
      .commitBook(
        ctx,
        { bookId, expectedVersion: 1 },
        {
          at: async (point, attempt) => {
            if (point === 'afterKeyLock' && attempt === 1) {
              paused.resolve();
              await release.promise;
            }
          },
          options: generous,
        },
      )
      .then(
        () => 'ok',
        (e) => code(e),
      );
    await paused.promise;
    await store.revokeSession(ctx.sessionId);
    release.resolve();
    expect(await command).toBe('SESSION_EXPIRED');
    expect((await effects()).commitments).toBe(0);
  });

  it('revoke during a locked command serializes after it; replay after revoke is denied', async () => {
    const ctx = await member();
    const bookId = await book();
    const paused = deferred(),
      revokeRetried = deferred();
    const command = store.commitBook(
      ctx,
      { bookId, expectedVersion: 1 },
      {
        at: async (point, attempt) => {
          if (point === 'afterLocks' && attempt === 1) {
            paused.resolve();
            await revokeRetried.promise;
          }
        },
        options: generous,
      },
    );
    await paused.promise;
    const revoke = store.revokeSession(ctx.sessionId, {
      ...generous,
      onAttempt: (n) => {
        if (n === 2) revokeRetried.resolve();
      },
    });
    const done = await command;
    const revokedAt = await revoke;
    expect(done.replayed).toBe(false);
    expect(revokedAt.getTime()).toBeGreaterThanOrEqual(
      new Date(done.receipt.decidedAt).getTime(),
    );
    await expect(
      store.commitBook(ctx, { bookId, expectedVersion: 1 }),
    ).rejects.toSatisfy((e) => code(e) === 'SESSION_EXPIRED');
  });
});

describe('atomicity', () => {
  for (const point of ['afterEffect', 'afterReceipt', 'afterAudit'] as const)
    it(`failure at ${point} leaves no partial commit`, async () => {
      const ctx = await member();
      const bookId = await book();
      await expect(
        store.commitBook(
          ctx,
          { bookId, expectedVersion: 1 },
          {
            at: (at) => {
              if (at === point) throw new Error(`injected ${point}`);
            },
          },
        ),
      ).rejects.toThrow(`injected ${point}`);
      expect(await effects()).toEqual({
        commitments: 0,
        receipts: 0,
        audit: 0,
        outbox: 0,
      });
      const stored = (await store.books().findOne({ _id: bookId }))!;
      expect([stored.state, stored.version]).toEqual(['Available', 1]);
      // The same key still works afterwards: nothing half-written blocks it.
      expect(
        (await store.commitBook(ctx, { bookId, expectedVersion: 1 })).replayed,
      ).toBe(false);
    });
});

describe('decision clock', () => {
  it('decision time is read after the competitor committed', async () => {
    const ctx = await member();
    const [x, y] = [await book(), await book()];
    const paused = deferred(),
      secondRetried = deferred(),
      firstObserved = deferred<Date>();
    const first = store.commitBook(
      ctx,
      { bookId: x, expectedVersion: 1 },
      {
        at: async (point, attempt) => {
          if (point === 'afterLocks' && attempt === 1) {
            paused.resolve();
            await secondRetried.promise;
          }
        },
        options: generous,
      },
    );
    await paused.promise;
    // Same user, other key/book: the user lock serializes the two commands.
    const second = store.commitBook(
      { ...ctx, key: randomUUID() },
      { bookId: y, expectedVersion: 1 },
      {
        options: {
          ...generous,
          onAttempt: async (n) => {
            if (n === 2) secondRetried.resolve();
            if (n >= 2) await firstObserved.promise;
          },
        },
      },
    );
    await first;
    const afterFirstCommit = await serverTime();
    firstObserved.resolve(afterFirstCommit);
    const done = await second;
    expect(new Date(done.receipt.decidedAt).getTime()).toBeGreaterThanOrEqual(
      afterFirstCommit.getTime(),
    );
  });

  it('a deadline passed while waiting is judged by the post-contention clock', async () => {
    const [holder, late] = [await member(), await member()];
    const deadline = new Date((await serverTime()).getTime() + 1500);
    const bookId = await book(deadline);
    const paused = deferred(),
      lateRetried = deferred();
    const holding = store
      .commitBook(
        holder,
        { bookId, expectedVersion: 1 },
        {
          at: async (point, attempt) => {
            if (point === 'afterLocks' && attempt === 1) {
              paused.resolve();
              await lateRetried.promise;
              // Hold the book lock until the server clock itself passes the deadline.
              while ((await serverTime()) <= deadline);
              throw new DomainError(409, 'InvalidState', 'holder gives up');
            }
          },
          options: generous,
        },
      )
      .catch((e) => code(e));
    await paused.promise;
    const startedBefore = await serverTime();
    const result = store
      .commitBook(
        late,
        { bookId, expectedVersion: 1 },
        {
          options: {
            ...generous,
            onAttempt: (n) => {
              if (n === 2) lateRetried.resolve();
            },
          },
        },
      )
      .then(
        () => 'ok',
        (e) => code(e),
      );
    expect(startedBefore.getTime()).toBeLessThan(deadline.getTime());
    expect(await holding).toBe('InvalidState');
    // Rejected by the deadline, not by state: the book is still Available.
    expect(await result).toBe('InvalidState');
    expect((await store.books().findOne({ _id: bookId }))!.state).toBe(
      'Available',
    );
  });
});

describe('retry budget and unknown commit', () => {
  it('persistent contention ends in a bounded 503, not an endless retry', async () => {
    const [holder, other] = [await member(), await member()];
    const bookId = await book();
    const paused = deferred(),
      release = deferred();
    const holding = store.commitBook(
      holder,
      { bookId, expectedVersion: 1 },
      {
        at: async (point, attempt) => {
          if (point === 'afterLocks' && attempt === 1) {
            paused.resolve();
            await release.promise;
          }
        },
        options: generous,
      },
    );
    await paused.promise;
    await expect(
      store.commitBook(
        other,
        { bookId, expectedVersion: 1 },
        { options: { maxAttempts: 3 } },
      ),
    ).rejects.toBeInstanceOf(TransactionBusyError);
    release.resolve();
    expect((await holding).replayed).toBe(false);
  });

  const failpoint = (data: object, times: number) =>
    client.db('admin').command({
      configureFailPoint: 'failCommand',
      mode: { times },
      data: { failCommands: ['commitTransaction'], ...data },
    });
  const failpointOff = () =>
    client
      .db('admin')
      .command({ configureFailPoint: 'failCommand', mode: 'off' });

  it('lost ACK after an applied commit: same key replays exactly one effect', async () => {
    const ctx = await member();
    const bookId = await book();
    // writeConcernError is returned after the commit has been applied.
    await failpoint(
      {
        writeConcernError: {
          // WriteConcernFailed, not a node-state error, so topology is untouched.
          code: 64,
          codeName: 'WriteConcernFailed',
          errmsg: 'MIG-01 injected lost acknowledgement',
          errInfo: { wtimeout: true },
        },
      },
      20,
    );
    try {
      await expect(
        store.commitBook(ctx, { bookId, expectedVersion: 1 }),
      ).rejects.toBeInstanceOf(CommitOutcomeUnknownError);
    } finally {
      await failpointOff();
    }
    const retried = await store.commitBook(ctx, { bookId, expectedVersion: 1 });
    expect(retried.replayed).toBe(true);
    expect(await effects()).toEqual({
      commitments: 1,
      receipts: 1,
      audit: 1,
      outbox: 1,
    });
  });

  it('commit never applied, outcome unknown: same key executes once after server abort', async () => {
    const ctx = await member();
    const bookId = await book();
    const admin = client.db('admin');
    const { was } = await admin.command({
      setParameter: 1,
      transactionLifetimeLimitSeconds: 2,
    });
    await failpoint({ closeConnection: true }, 20);
    try {
      await expect(
        store.commitBook(ctx, { bookId, expectedVersion: 1 }),
      ).rejects.toBeInstanceOf(CommitOutcomeUnknownError);
      await failpointOff();
      // The orphaned transaction still holds its write intents until the server
      // aborts it; a client retrying the same key sees 503 until then.
      let outcome: Awaited<ReturnType<ProbeStore['commitBook']>> | undefined;
      for (let i = 0; i < 100 && !outcome; i++)
        outcome = await store
          .commitBook(
            ctx,
            { bookId, expectedVersion: 1 },
            { options: generous },
          )
          .catch((e) => {
            if (e instanceof TransactionBusyError) return undefined;
            throw e;
          });
      expect(outcome?.replayed).toBe(false);
    } finally {
      await failpointOff();
      await admin.command({
        setParameter: 1,
        transactionLifetimeLimitSeconds: was,
      });
    }
    expect(await effects()).toEqual({
      commitments: 1,
      receipts: 1,
      audit: 1,
      outbox: 1,
    });
  });
});
