import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { components } from '@used-books/api-contract';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { OPENING_JOURNAL_ID } from '../src/database/mongo/migrations/0002-reference-data.js';
import { runTransaction } from '../src/database/mongo/transaction.js';
import { PaymentSimulator } from '../src/modules/wallet/payment-simulator.js';
import {
  CLEARING_ID,
  checkJournal,
  checkTopupRecord,
  LedgerService,
} from '../src/modules/wallet/ledger.service.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

type Reader = { id: string; token: string; sessionId: string };
type Event = components['schemas']['SimulatedTopupEvent'];

describe('Simulated wallet: real MongoDB and HTTP', () => {
  let app: INestApplication,
    db: MongoFixtures,
    operator: Reader,
    otherOperator: Reader;
  const users: string[] = [];
  const originalSecret = process.env.PAYMENT_SIMULATOR_SECRET;
  const get = (path: string, actor?: Reader) => {
    const call = request(app.getHttpServer()).get('/api/v1' + path);
    return actor ? call.set('Authorization', `Bearer ${actor.token}`) : call;
  };
  const post = (
    path: string,
    body: object,
    actor: Reader,
    key = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const emit = (body: Event, actor = operator, key = randomUUID()) =>
    post('/operations/simulator/topup-events', body, actor, key);
  async function reader(
    roles: RoleCode[] = ['MEMBER'],
    status: UserStatus = 'ACTIVE',
  ): Promise<Reader> {
    const user = await db.user({
      roles,
      status,
      displayName: 'Bạn đọc mô phỏng',
    });
    users.push(user._id);
    const sessionId = await db.session(user._id);
    return {
      id: user._id,
      sessionId,
      token: await app
        .get(JwtService)
        .signAsync({ sub: user._id, sid: sessionId }),
    };
  }
  async function makeApp() {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const a = module.createNestApplication();
    a.get(ConfigService).set(
      'PAYMENT_SIMULATOR_SECRET',
      process.env.PAYMENT_SIMULATOR_SECRET,
    );
    configureApp(a, { docs: false, logRequests: false });
    await a.init();
    // One listening socket for the whole app lifetime: supertest otherwise
    // listens/closes per request, and a close racing the staggered 503
    // retries of the 100-request test resets in-flight connections.
    await a.listen(0, '127.0.0.1');
    return a;
  }
  async function intent(actor: Reader, amount = 200000) {
    const result = await post('/me/topups', { amount }, actor).expect(200);
    validates('WalletCommandReceipt', result.body);
    return result.body as components['schemas']['WalletCommandReceipt'];
  }
  async function event(actor: Reader, amount = 200000) {
    const created = await intent(actor, amount);
    return {
      eventId: randomUUID(),
      intentId: created.entityId,
      recipientId: actor.id,
      amount,
      currency: 'VND',
      outcome: 'Succeeded' as const,
      occurredAt: new Date().toISOString(),
    };
  }
  const available = async (actor: Reader) =>
    (await get('/me/wallet', actor).expect(200)).body.available;
  // Holds a write lock in a transaction, like `SELECT ... FOR UPDATE`: the
  // participant's user document, or the funding account's posting lock
  // (account_locks replaces the wallet_accounts row lock).
  const block = (collection: 'users' | 'account_locks', id: string) =>
    Gate.lock(db.client, collection, [id]);
  async function counts(id: string) {
    return {
      events: await db.c.simulated_payment_events.countDocuments({
        intentId: id,
      }),
      journals: await db.c.ledger_journals.countDocuments({ topupId: id }),
      receipts: await db.c.mutation_receipts.countDocuments({ topupId: id }),
      audits: await db.c.audit_events.countDocuments({ topupId: id }),
    };
  }
  const intentState = async (id: string) =>
    (await db.c.topup_intents.findOne({ _id: id }))!.state;
  const clearingBalance = async () => {
    const [row] = await db.c.ledger_entries
      .aggregate<{ n: number }>([
        { $match: { accountId: CLEARING_ID } },
        {
          $group: {
            _id: null,
            n: { $sum: { $subtract: ['$debit', '$credit'] } },
          },
        },
      ])
      .toArray();
    return row?.n ?? 0;
  };
  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    db = await MongoFixtures.connect();
    app = await makeApp();
    operator = await reader(['TEST_OPERATOR']);
    otherOperator = await reader(['TEST_OPERATOR']);
  }, 60000);
  afterAll(async () => {
    // Removes only this suite's records. Deleting its journals and entries
    // returns the drained simulator funds to the shared source; the opening
    // capital journal is never touched.
    if (db) {
      const c = db.c;
      const topups = (
        await c.topup_intents.find({ ownerId: { $in: users } }).toArray()
      ).map((t) => t._id);
      const journals = (
        await c.ledger_journals.find({ topupId: { $in: topups } }).toArray()
      ).map((j) => j._id);
      const accounts = (
        await c.wallet_accounts.find({ ownerId: { $in: users } }).toArray()
      ).map((a) => a._id);
      const audits = (
        await c.audit_events.find({ topupId: { $in: topups } }).toArray()
      ).map((a) => a._id);
      await c.ledger_entries.deleteMany({ journalId: { $in: journals } });
      await c.ledger_journals.deleteMany({ _id: { $in: journals } });
      await c.simulated_payment_events.deleteMany({
        intentId: { $in: topups },
      });
      await c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await c.audit_events.deleteMany({ _id: { $in: audits } });
      await c.mutation_receipts.deleteMany({ topupId: { $in: topups } });
      await c.topup_intents.deleteMany({ _id: { $in: topups } });
      await c.account_locks.deleteMany({ _id: { $in: accounts } });
      await c.wallet_accounts.deleteMany({ _id: { $in: accounts } });
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
    if (originalSecret === undefined)
      delete process.env.PAYMENT_SIMULATOR_SECRET;
    else process.env.PAYMENT_SIMULATOR_SECRET = originalSecret;
  });
  it('starts at zero, creates intent without credit and posts two balanced entries on authenticated success', async () => {
    const member = await reader();
    expect(await available(member)).toBe(0);
    const body = await event(member);
    expect(await available(member)).toBe(0);
    const response = await emit(body).expect(200);
    validates('WalletCommandReceipt', response.body);
    expect(response.body).toMatchObject({ state: 'Succeeded', credited: true });
    const view = await get('/me/wallet', member).expect(200);
    validates('WalletSummary', view.body);
    expect(view.headers['cache-control']).toContain('no-store');
    expect(view.body).toMatchObject({
      available: 200000,
      transactionHeld: 0,
      withdrawalHeld: 0,
      demoOnly: true,
      paymentsEnabled: true,
      withdrawalsEnabled: false,
    });
    const entries = await db.c.ledger_entries
      .find({ journalId: response.body.journalId })
      .toArray();
    expect(entries).toHaveLength(2);
    expect(entries.reduce((n, e) => n + e.debit - e.credit, 0)).toBe(0);
    const history = await get('/me/wallet/history', member).expect(200);
    validates('WalletHistoryPage', history.body);
    expect(history.body.items[0]).toMatchObject({
      topupId: body.intentId,
      amount: 200000,
      balanceAfter: 200000,
    });
  });
  it('same key replays after restart; event identity also dedupes different keys/operators', async () => {
    const member = await reader(),
      body = await event(member),
      key = randomUUID();
    const first = await emit(body, operator, key).expect(200);
    await app.close();
    app = await makeApp();
    const replay = await emit(body, operator, key).expect(200);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await emit(body, otherOperator).expect(200);
    expect(await available(member)).toBe(body.amount);
    expect((await counts(body.intentId)).events).toBe(1);
    await emit({ ...body, amount: body.amount + 1 }, operator, key).expect(409);
    await emit({ ...body, amount: body.amount + 1 }).expect(409);
    expect(await available(member)).toBe(body.amount);
  });
  it('create intent replay is immutable and a changed amount conflicts', async () => {
    const member = await reader(),
      key = randomUUID();
    const a = await post('/me/topups', { amount: 1000 }, member, key).expect(
      200,
    );
    const b = await post('/me/topups', { amount: 1000 }, member, key).expect(
      200,
    );
    expect(a.body).toEqual(b.body);
    await post('/me/topups', { amount: 2000 }, member, key).expect(409);
    expect(await available(member)).toBe(0);
  });
  it.each([
    { amount: 0 },
    { amount: 1.1 },
    { amount: 10000001 },
    { amount: 1000, ownerId: randomUUID() },
    { amount: 1000, state: 'Succeeded' },
    { amount: 1000, systemActor: 'Payment' },
  ])('rejects forged/invalid intent %j', async (body) => {
    await post('/me/topups', body, await reader()).expect(422);
  });
  it.each(['amount', 'currency', 'recipientId', 'past', 'future'] as const)(
    'mismatched %s becomes sticky ReviewRequired without money',
    async (field) => {
      const member = await reader(),
        body = await event(member);
      const wrong = {
        ...body,
        ...(field === 'amount'
          ? { amount: body.amount + 1 }
          : field === 'currency'
            ? { currency: 'USD' }
            : field === 'recipientId'
              ? { recipientId: randomUUID() }
              : field === 'past'
                ? { occurredAt: '2000-01-01T00:00:00.000Z' }
                : { occurredAt: '2099-01-01T00:00:00.000Z' }),
      };
      expect((await emit(wrong).expect(200)).body).toMatchObject({
        state: 'ReviewRequired',
        credited: false,
      });
      await emit({ ...body, eventId: randomUUID() }).expect(200);
      expect(await available(member)).toBe(0);
      expect(await intentState(body.intentId)).toBe('ReviewRequired');
    },
  );
  it.each(['Succeeded', 'Failed'] as const)(
    'contradictory outcome after %s preserves existing money and blocks automatic correction',
    async (outcome) => {
      const member = await reader(),
        body = await event(member);
      await emit({ ...body, outcome }).expect(200);
      const result = await emit({
        ...body,
        eventId: randomUUID(),
        outcome: outcome === 'Succeeded' ? 'Failed' : 'Succeeded',
      }).expect(200);
      expect(result.body.state).toBe('ReviewRequired');
      expect(await available(member)).toBe(
        outcome === 'Succeeded' ? body.amount : 0,
      );
    },
  );
  it('accepts delayed processing, ignores processing after success and does not replay credits', async () => {
    const member = await reader(),
      body = await event(member);
    await emit({ ...body, outcome: 'Processing' }).expect(200);
    expect(await available(member)).toBe(0);
    await emit({ ...body, eventId: randomUUID() }).expect(200);
    await emit({
      ...body,
      eventId: randomUUID(),
      outcome: 'Processing',
    }).expect(200);
    await emit({ ...body, eventId: randomUUID() }).expect(200);
    expect(await available(member)).toBe(body.amount);
    expect(
      (await get('/me/topups/' + body.intentId, member).expect(200)).body.state,
    ).toBe('Succeeded');
  });
  it('guest, member, staff and admin cannot act as a simulator; operators cannot fund themselves', async () => {
    const member = await reader(),
      body = await event(member);
    await get('/me/wallet').expect(401);
    for (const actor of [
      member,
      await reader(['STAFF']),
      await reader(['ADMIN']),
    ])
      await emit(body, actor).expect(403);
    const both = await reader(['MEMBER', 'TEST_OPERATOR']);
    await emit(await event(both), both).expect(403);
    await get('/me/wallet', operator).expect(403);
  });
  it('own reads and cursors never expose another wallet', async () => {
    const a = await reader(),
      b = await reader(),
      body = await event(a);
    await emit(body).expect(200);
    await get('/me/topups/' + body.intentId, b).expect(404);
    const h = (await get('/me/wallet/history', a).expect(200)).body.items[0];
    await get('/me/wallet/history?cursor=' + h.journalId, b).expect(404);
    await get('/me/topups?cursor=' + body.intentId, b).expect(404);
    expect((await get('/me/topups', b).expect(200)).body.items).toEqual([]);
    await get('/me/wallet/history?ownerId=' + a.id, b).expect(400);
  });
  it('restricted members can top up; locked members cannot access general APIs, but valid prior funds still arrive', async () => {
    const member = await reader(['MEMBER'], 'RESTRICTED'),
      body = await event(member);
    await db.setStatus(member.id, 'LOCKED');
    await emit(body).expect(200);
    const wallet = await get('/me/wallet', member).expect(200);
    expect(wallet.body).toMatchObject({
      available: body.amount,
      topupEnabled: false,
    });
    await post('/me/topups', { amount: 1000 }, member).expect(403);
    await db.setStatus(member.id, 'ACTIVE');
    expect(await available(member)).toBe(body.amount);
  });
  it('rejects disabled simulator and invalid/tampered signed envelopes without posting', async () => {
    const member = await reader(),
      body = await event(member),
      simulator = app.get(PaymentSimulator);
    const signed = simulator.sign(body);
    expect(() =>
      simulator.verify({ ...body, amount: body.amount + 1 }, signed),
    ).toThrow();
    expect(() => simulator.verify(body, '00')).toThrow();
    const config = app.get(ConfigService),
      original = config.get<string>('PAYMENT_SIMULATOR_SECRET');
    config.set('PAYMENT_SIMULATOR_SECRET', '');
    try {
      await emit(body).expect(503);
      await post('/me/topups', { amount: 1000 }, member).expect(503);
    } finally {
      config.set('PAYMENT_SIMULATOR_SECRET', original);
    }
    expect(await available(member)).toBe(0);
  });
  it('history filters preserve balanceAfter and keyset pages have no duplicates', async () => {
    const member = await reader();
    const ids: string[] = [];
    for (const amount of [1000, 2000, 3000]) {
      const body = await event(member, amount);
      ids.push(body.intentId);
      await emit(body).expect(200);
    }
    const first = (await get('/me/wallet/history?limit=2', member).expect(200))
      .body;
    expect(first.items.map((i: any) => i.balanceAfter)).toEqual([6000, 3000]);
    const second = (
      await get(
        '/me/wallet/history?limit=2&cursor=' + first.nextCursor,
        member,
      ).expect(200)
    ).body;
    expect(second.items).toHaveLength(1);
    expect(second.items[0].balanceAfter).toBe(1000);
    expect(second.nextCursor).toBeNull();
    const filtered = (
      await get('/me/wallet/history?topupId=' + ids[1], member).expect(200)
    ).body;
    expect(filtered.items[0].balanceAfter).toBe(3000);
    const topups = (
      await get('/me/topups?state=Succeeded&limit=2', member).expect(200)
    ).body;
    validates('TopupPage', topups);
    expect(topups.items).toHaveLength(2);
    expect(
      (await get('/me/topups?cursor=' + topups.nextCursor, member).expect(200))
        .body.items,
    ).toHaveLength(1);
    await get(
      '/me/wallet/history?from=2099-01-01T00:00:00Z&to=2000-01-01T00:00:00Z',
      member,
    ).expect(400);
  });
  it('100 requests with one provider event under an actual user lock credit once', async () => {
    const member = await reader(),
      body = await event(member),
      gate = await block('users', member.id);
    // PostgreSQL queued all 100 on the row lock. MongoDB aborts and retries
    // within a 5 s budget and answers 503 "retry the same request" when it is
    // exhausted (ADR 0027, MIG05 design §5.2). A client that does exactly that
    // must end with 100 successes; a 503 must have had no effect.
    const settle = async (actor: Reader) => {
      const key = randomUUID();
      for (let attempt = 1; ; attempt++) {
        const r = await emit(body, actor, key);
        if (r.status !== 503 || attempt === 10) return r.status;
      }
    };
    let calls: Promise<number>[] = [];
    try {
      calls = Array.from({ length: 100 }, (_, i) =>
        settle(i % 2 ? operator : otherOperator),
      );
      await gate.contended();
      await gate.commit();
      expect(await Promise.all(calls)).toEqual(Array(100).fill(200));
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
    expect(await available(member)).toBe(body.amount);
    expect((await counts(body.intentId)).journals).toBe(1);
    expect((await counts(body.intentId)).events).toBe(1);
    // One receipt for the intent plus exactly one per request key.
    expect((await counts(body.intentId)).receipts).toBe(101);
  }, 60000);
  it('different success event IDs racing on one intent still credit once', async () => {
    const member = await reader(),
      body = await event(member),
      gate = await block('users', member.id);
    let calls: Promise<number>[] = [];
    try {
      calls = Array.from({ length: 20 }, () =>
        emit({ ...body, eventId: randomUUID() }).then((r) => r.status),
      );
      await gate.contended();
      await gate.commit();
      expect(await Promise.all(calls)).toEqual(Array(20).fill(200));
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
    expect(await available(member)).toBe(body.amount);
    expect((await counts(body.intentId)).journals).toBe(1);
  });
  it('concurrent intent creation cannot exceed the unresolved quota', async () => {
    const member = await reader(),
      gate = await block('users', member.id);
    let calls: Promise<number>[] = [];
    try {
      calls = Array.from({ length: 20 }, () =>
        post('/me/topups', { amount: 1000 }, member).then((r) => r.status),
      );
      await gate.contended();
      await gate.commit();
      const statuses = await Promise.all(calls);
      expect(statuses.filter((s) => s === 200)).toHaveLength(10);
      expect(statuses.filter((s) => s === 409)).toHaveLength(10);
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
  });
  it.each(['role', 'status', 'session'] as const)(
    'rechecks operator %s after a DB lock wait before posting/replay',
    async (kind) => {
      const op = await reader(['TEST_OPERATOR']),
        member = await reader(),
        body = await event(member),
        key = randomUUID();
      const gate = await block('users', op.id);
      const result = emit(body, op, key).then((r) => r.status);
      try {
        await gate.contended();
        // The change commits together with the lock holder, like the
        // statement issued on the blocking PostgreSQL connection.
        const inGate = { session: gate.session };
        const usersCollection = gate.db.collection<{ _id: string }>('users');
        if (kind === 'role')
          await usersCollection.updateOne(
            { _id: op.id },
            { $pull: { roles: { role: 'TEST_OPERATOR' } } } as never,
            inGate,
          );
        else if (kind === 'status')
          await usersCollection.updateOne(
            { _id: op.id },
            { $set: { status: 'RESTRICTED' } },
            inGate,
          );
        else
          await gate.db
            .collection<{ _id: string }>('auth_sessions')
            .updateOne(
              { _id: op.sessionId },
              { $set: { revokedAt: new Date() } },
              inGate,
            );
        await gate.commit();
      } finally {
        await gate.close();
      }
      expect(await result).toBe(kind === 'session' ? 401 : 403);
      expect(await available(member)).toBe(0);
      expect((await counts(body.intentId)).events).toBe(0);
    },
  );
  it('session expires while waiting on the funding account and cannot credit', async () => {
    const op = await reader(['TEST_OPERATOR']),
      member = await reader(),
      body = await event(member),
      gate = await block('account_locks', CLEARING_ID);
    let call: Promise<number> | undefined;
    try {
      await db.c.auth_sessions.updateOne(
        { _id: op.sessionId },
        {
          $set: { expiresAt: new Date(Date.now() + 1200) },
          $inc: { lockSeq: 1 },
        },
      );
      call = emit(body, op).then((r) => r.status);
      await gate.contended();
      await new Promise((r) => setTimeout(r, 1300));
      await gate.commit();
    } finally {
      await gate.close();
    }
    expect(await call).toBe(401);
    expect(await available(member)).toBe(0);
  });
  it.each([
    'simulated_payment_events',
    'ledger_journals',
    'ledger_entries',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ])(
    'rolls back every effect at %s failpoint and retries the same request',
    async (collection) => {
      const member = await reader(),
        body = await event(member),
        key = randomUUID(),
        before = await counts(body.intentId);
      // Temporary validator rule rejecting every insert (the former failing
      // BEFORE INSERT trigger); suites run one at a time.
      await db.withRejectingValidator(
        collection,
        { _id: { $exists: true } },
        () => emit(body, operator, key).expect(500),
      );
      expect(await counts(body.intentId)).toEqual(before);
      expect(await available(member)).toBe(0);
      expect(await intentState(body.intentId)).toBe('Pending');
      await emit(body, operator, key).expect(200);
      expect(await available(member)).toBe(body.amount);
    },
  );
  it('MongoDB rejects edits/deletes; fabricated balances, orphans and unbalanced journals fail commit-time checks', async () => {
    const member = await reader(),
      body = await event(member),
      r = await emit(body).expect(200);
    const mongo = app.get(MongoService);
    // Posted money is append-only for the application user (P, code 13).
    await expect(
      mongo.c.ledger_entries.updateOne(
        { journalId: r.body.journalId, debit: { $gt: 0 } },
        { $inc: { debit: 1 } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.ledger_journals.deleteOne({ _id: r.body.journalId }),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.simulated_payment_events.deleteOne({ _id: body.eventId }),
    ).rejects.toMatchObject({ code: 13 });
    // Cross-document rules are commit-time checks (C): run inside the
    // transaction that attempts the write, they abort it.
    await expect(
      mongo.tx(async (tx) => {
        await tx.c.topup_intents.updateOne(
          { _id: body.intentId },
          { $inc: { amount: 1, version: 1 } },
        );
        await checkTopupRecord(tx, body.intentId);
      }),
    ).rejects.toThrow('Topup event/ledger/receipt mismatch');
    expect(
      await db.c.topup_intents.findOne({ _id: body.intentId }),
    ).toMatchObject({ amount: body.amount, version: 2, state: 'Succeeded' });
    const orphan = randomUUID();
    await expect(
      mongo.tx(async (tx) => {
        const now = await tx.now();
        await tx.c.topup_intents.insertOne({
          _id: orphan,
          ownerId: member.id,
          amount: 1000,
          currency: 'VND',
          state: 'Pending',
          version: 1,
          createdAt: now,
          updatedAt: now,
          lockSeq: 0,
        });
        await checkTopupRecord(tx, orphan);
      }),
    ).rejects.toThrow('Topup event/ledger/receipt mismatch');
    expect(await db.c.topup_intents.countDocuments({ _id: orphan })).toBe(0);
    const account = (await db.c.wallet_accounts.findOne({
      ownerId: member.id,
    }))!._id;
    await expect(
      mongo.tx(async (tx) => {
        await tx.c.ledger_entries.insertOne({
          _id: `${OPENING_JOURNAL_ID}:${account}`,
          journalId: OPENING_JOURNAL_ID,
          accountId: account,
          debit: 1000,
          credit: 0,
        });
        await checkJournal(tx, OPENING_JOURNAL_ID);
      }),
    ).rejects.toThrow('Journal must have two balanced entries');
    expect(await available(member)).toBe(body.amount);
  });
  // This audits the shared database accumulated by preceding E2E suites three
  // times, including corruption rollback; it is not a single-command latency test.
  it('reconciliation validates sources and detects corruption injected only in a rolled-back test transaction', async () => {
    const ledger = app.get(LedgerService),
      mongo = app.get(MongoService);
    const good = await mongo.tx((tx) => ledger.reconcile(tx));
    expect(good.balanced).toBe(true);
    // Settled platform commission (auction Orders) stays in the capital.
    expect(
      good.sourceRemaining +
        good.memberAvailable +
        good.transactionHeld +
        good.platformCommission,
    ).toBe(100000000);
    // Only a privileged writer (the migrator here, a DB owner before) can
    // alter a posted entry; done inside a transaction that is rolled back.
    await expect(
      runTransaction(db.client, db.client.db(), async (tx) => {
        await tx.c.ledger_entries.updateOne(
          { journalId: OPENING_JOURNAL_ID, debit: { $gt: 0 } },
          { $inc: { debit: -1 } },
        );
        await ledger.reconcile(tx);
      }),
    ).rejects.toThrow();
    const restored = await mongo.tx((tx) => ledger.reconcile(tx));
    expect(restored).toEqual(good);
    await expect(
      mongo.c.ledger_entries.updateOne(
        { journalId: OPENING_JOURNAL_ID, debit: { $gt: 0 } },
        { $inc: { debit: -1 } },
      ),
    ).rejects.toMatchObject({ code: 13 });
  }, 60000);
  it('simultaneous same HTTP key has one immutable receipt, and revoked role cannot replay it', async () => {
    const op = await reader(['TEST_OPERATOR']),
      member = await reader(),
      body = await event(member),
      key = randomUUID();
    const gate = await block('users', member.id);
    let calls: Promise<request.Response>[] = [];
    try {
      calls = Array.from({ length: 20 }, () =>
        emit(body, op, key).then((r) => r),
      );
      await gate.contended();
      await gate.commit();
    } finally {
      await gate.close();
    }
    const results = await Promise.all(calls);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await available(member)).toBe(body.amount);
    await db.removeRole(op.id, 'TEST_OPERATOR');
    await emit(body, op, key).expect(403);
  });
  it('cannot reuse a provider event ID to fund a different intent', async () => {
    const a = await reader(),
      b = await reader(),
      ea = await event(a),
      eb = await event(b);
    await emit(ea).expect(200);
    await emit({ ...eb, eventId: ea.eventId }, otherOperator).expect(409);
    expect(await available(b)).toBe(0);
    expect((await counts(eb.intentId)).events).toBe(0);
  });
  it('two contenders for the last source funds cannot overdraw or mint new capital', async () => {
    const total = await clearingBalance();
    let drain = total - 10000000;
    while (drain > 0) {
      const member = await reader();
      const amount = Math.min(10000000, drain);
      await emit(await event(member, amount)).expect(200);
      drain -= amount;
    }
    const a = await reader(),
      b = await reader(),
      ea = await event(a, 10000000),
      eb = await event(b, 10000000),
      gate = await block('account_locks', CLEARING_ID);
    let calls: Promise<number>[] = [];
    try {
      calls = [
        emit(ea).then((r) => r.status),
        emit(eb, otherOperator).then((r) => r.status),
      ];
      await gate.contended();
      await gate.commit();
    } finally {
      await gate.close();
    }
    expect((await Promise.all(calls)).sort()).toEqual([200, 503]);
    expect((await available(a)) + (await available(b))).toBe(10000000);
    expect(await clearingBalance()).toBe(0);
    expect(
      await db.c.ledger_journals.countDocuments({ type: 'OpeningCapital' }),
    ).toBe(1);
    // Bypass only the application balance check in this test: the commit-time
    // journal check must still reject a fully shaped journal that would
    // overdraw the source.
    const forged = await event(await reader(), 1000);
    const balance = vi
      .spyOn(app.get(LedgerService), 'balance')
      .mockResolvedValue(100000000);
    try {
      await emit(forged).expect(500);
    } finally {
      balance.mockRestore();
    }
    expect((await counts(forged.intentId)).journals).toBe(0);
    expect((await counts(forged.intentId)).events).toBe(0);
  }, 30000);
});
