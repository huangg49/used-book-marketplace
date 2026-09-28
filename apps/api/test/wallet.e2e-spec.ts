import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type RoleCode,
  type UserStatus,
} from '../src/generated/prisma/client.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PaymentSimulator } from '../src/modules/wallet/payment-simulator.js';
import {
  CLEARING_ID,
  LedgerService,
} from '../src/modules/wallet/ledger.service.js';
import request from 'supertest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import type { components } from '@used-books/api-contract';

const contract = parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      '@used-books/api-contract/openapi.yaml',
    ),
    'utf8',
  ),
);
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);
ajv.addSchema({ $id: 'api-wire', components: contract.components });
function validates(name: string, body: unknown) {
  const fn = ajv.compile({ $ref: `api-wire#/components/schemas/${name}` });
  expect(fn(body), JSON.stringify(fn.errors)).toBe(true);
}
type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
type Pool = ReturnType<Adapter['underlyingDriver']>;
type Reader = { id: string; token: string; sessionId: string };
type Event = components['schemas']['SimulatedTopupEvent'];

describe('Simulated wallet: real PostgreSQL and HTTP', () => {
  const schema = `wallet_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication,
    db: PrismaClient,
    adapter: Adapter,
    pool: Pool,
    operator: Reader,
    otherOperator: Reader;
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
    const id = randomUUID(),
      sessionId = randomUUID();
    await db.user.create({
      data: {
        id,
        emailNormalized: `${id}@wallet.test`,
        passwordHash: 'unused-fixture',
        displayName: 'Bạn đọc mô phỏng',
        status,
        emailVerifiedAt: new Date(),
        roles: { create: roles.map((role) => ({ role })) },
        sessions: {
          create: {
            id: sessionId,
            refreshTokenHash: randomBytes(32).toString('hex'),
            expiresAt: new Date(Date.now() + 86400000),
          },
        },
      },
    });
    return {
      id,
      sessionId,
      token: await app.get(JwtService).signAsync({ sub: id, sid: sessionId }),
    };
  }
  async function makeApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();
    const a = module.createNestApplication();
    a.get(ConfigService).set(
      'PAYMENT_SIMULATOR_SECRET',
      process.env.PAYMENT_SIMULATOR_SECRET,
    );
    configureApp(a, { docs: false, logRequests: false });
    await a.init();
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
  async function block(table: string, id: string) {
    const connection = await pool.connect();
    await connection.query('BEGIN');
    await connection.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [
      id,
    ]);
    const pid = (await connection.query('SELECT pg_backend_pid() pid')).rows[0]
      .pid as number;
    return { connection, pid };
  }
  async function reached(gate: Awaited<ReturnType<typeof block>>) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      await gate.connection.query('SELECT pg_stat_clear_snapshot()');
      const n = (
        await gate.connection.query(
          'SELECT count(*)::int n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',
          [gate.pid],
        )
      ).rows[0].n;
      if (n) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Request never reached DB barrier');
  }
  async function counts(id: string) {
    return {
      events: await db.simulatedPaymentEvent.count({ where: { intentId: id } }),
      journals: await db.ledgerJournal.count({ where: { topupId: id } }),
      receipts: await db.mutationReceipt.count({ where: { topupId: id } }),
      audits: await db.auditEvent.count({ where: { topupId: id } }),
    };
  }
  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    const url = process.env.TEST_DATABASE_URL!;
    if (!decodeURIComponent(new URL(url).pathname).endsWith('_test'))
      throw new Error('Only _test databases');
    adapter = await new PrismaPg({
      connectionString: url,
      max: 16,
      options: `-c search_path=${schema},public -c timezone=UTC`,
      statement_timeout: 15000,
    }).connect();
    pool = adapter.underlyingDriver();
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const name of readdirSync('prisma/migrations')
      .filter((n) => /^\d/.test(n))
      .sort())
      await pool.query(
        readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'),
      );
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    await db.$connect();
    app = await makeApp();
    operator = await reader(['TEST_OPERATOR']);
    otherOperator = await reader(['TEST_OPERATOR']);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool && /^wallet_http_test_[a-f0-9]{32}$/.test(schema))
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adapter?.dispose();
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
    const entries = await db.ledgerEntry.findMany({
      where: { journalId: response.body.journalId },
    });
    expect(entries).toHaveLength(2);
    expect(entries.reduce((n, e) => n + e.debit - e.credit, 0n)).toBe(0n);
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
      expect(
        (
          await db.topupIntent.findUniqueOrThrow({
            where: { id: body.intentId },
          })
        ).state,
      ).toBe('ReviewRequired');
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
    await db.user.update({
      where: { id: member.id },
      data: { status: 'LOCKED' },
    });
    await emit(body).expect(200);
    const wallet = await get('/me/wallet', member).expect(200);
    expect(wallet.body).toMatchObject({
      available: body.amount,
      topupEnabled: false,
    });
    await post('/me/topups', { amount: 1000 }, member).expect(403);
    await db.user.update({
      where: { id: member.id },
      data: { status: 'ACTIVE' },
    });
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
    const calls = Array.from({ length: 100 }, (_, i) =>
      emit(body, i % 2 ? operator : otherOperator).then((r) => r.status),
    );
    try {
      await reached(gate);
    } finally {
      await gate.connection.query('COMMIT');
      gate.connection.release();
    }
    expect(await Promise.all(calls)).toEqual(Array(100).fill(200));
    expect(await available(member)).toBe(body.amount);
    expect((await counts(body.intentId)).journals).toBe(1);
    expect((await counts(body.intentId)).events).toBe(1);
  }, 30000);
  it('different success event IDs racing on one intent still credit once', async () => {
    const member = await reader(),
      body = await event(member),
      gate = await block('users', member.id);
    const calls = Array.from({ length: 20 }, () =>
      emit({ ...body, eventId: randomUUID() }).then((r) => r.status),
    );
    try {
      await reached(gate);
    } finally {
      await gate.connection.query('COMMIT');
      gate.connection.release();
    }
    expect(await Promise.all(calls)).toEqual(Array(20).fill(200));
    expect(await available(member)).toBe(body.amount);
    expect((await counts(body.intentId)).journals).toBe(1);
  });
  it('concurrent intent creation cannot exceed the unresolved quota', async () => {
    const member = await reader(),
      gate = await block('users', member.id);
    const calls = Array.from({ length: 20 }, () =>
      post('/me/topups', { amount: 1000 }, member).then((r) => r.status),
    );
    try {
      await reached(gate);
    } finally {
      await gate.connection.query('COMMIT');
      gate.connection.release();
    }
    const statuses = await Promise.all(calls);
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.filter((s) => s === 409)).toHaveLength(10);
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
        await reached(gate);
        if (kind === 'role')
          await gate.connection.query(
            'DELETE FROM user_roles WHERE user_id=$1',
            [op.id],
          );
        else if (kind === 'status')
          await gate.connection.query(
            "UPDATE users SET status='RESTRICTED' WHERE id=$1",
            [op.id],
          );
        else
          await gate.connection.query(
            'UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1',
            [op.sessionId],
          );
      } finally {
        await gate.connection.query('COMMIT');
        gate.connection.release();
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
      gate = await block('wallet_accounts', CLEARING_ID);
    await db.authSession.update({
      where: { id: op.sessionId },
      data: { expiresAt: new Date(Date.now() + 1200) },
    });
    const call = emit(body, op).then((r) => r.status);
    try {
      await reached(gate);
      await new Promise((r) => setTimeout(r, 1300));
    } finally {
      await gate.connection.query('COMMIT');
      gate.connection.release();
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
    async (table) => {
      const member = await reader(),
        body = await event(member),
        key = randomUUID(),
        before = await counts(body.intentId);
      await pool.query(
        `CREATE FUNCTION fail_wallet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failpoint'; END $$; CREATE TRIGGER fail_wallet BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_wallet()`,
      );
      try {
        await emit(body, operator, key).expect(500);
      } finally {
        await pool.query(
          `DROP TRIGGER fail_wallet ON ${table}; DROP FUNCTION fail_wallet()`,
        );
      }
      expect(await counts(body.intentId)).toEqual(before);
      expect(await available(member)).toBe(0);
      expect(
        (
          await db.topupIntent.findUniqueOrThrow({
            where: { id: body.intentId },
          })
        ).state,
      ).toBe('Pending');
      await emit(body, operator, key).expect(200);
      expect(await available(member)).toBe(body.amount);
    },
  );
  it('SQL rejects edits/deletes, fabricated balances, orphans, and unbalanced journals', async () => {
    const member = await reader(),
      body = await event(member),
      r = await emit(body).expect(200);
    await expect(
      pool.query(
        'UPDATE ledger_entries SET debit=debit+1 WHERE journal_id=$1 AND debit>0',
        [r.body.journalId],
      ),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query('DELETE FROM ledger_journals WHERE id=$1', [r.body.journalId]),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query('DELETE FROM simulated_payment_events WHERE id=$1', [
        body.eventId,
      ]),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query(
        'UPDATE topup_intents SET amount=amount+1,version=version+1 WHERE id=$1',
        [body.intentId],
      ),
    ).rejects.toThrow('transition');
    await expect(
      pool.query(
        'INSERT INTO topup_intents(id,owner_id,amount,created_at,updated_at) VALUES($1,$2,1000,now(),now())',
        [randomUUID(), member.id],
      ),
    ).rejects.toThrow('mismatch');
    const account = (
      await db.walletAccount.findUniqueOrThrow({
        where: { ownerId: member.id },
      })
    ).id;
    await expect(
      pool.query(
        'INSERT INTO ledger_entries(journal_id,account_id,debit,credit) VALUES($1,$2,1000,0)',
        ['00000000-0000-4000-8000-000000000003', account],
      ),
    ).rejects.toThrow('two balanced');
    expect(await available(member)).toBe(body.amount);
  });
  it('reconciliation validates sources and detects corruption injected only in a rolled-back test transaction', async () => {
    const ledger = app.get(LedgerService);
    const good = await db.$transaction((tx) => ledger.reconcile(tx), {
      isolationLevel: 'RepeatableRead',
    });
    expect(good.balanced).toBe(true);
    expect(good.sourceRemaining + good.memberAvailable).toBe(100000000);
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entry_immutable',
        );
        await tx.$executeRawUnsafe(
          "UPDATE ledger_entries SET debit=debit-1 WHERE journal_id='00000000-0000-4000-8000-000000000003' AND debit>0",
        );
        await ledger.reconcile(tx);
      }),
    ).rejects.toThrow();
    const restored = await db.$transaction((tx) => ledger.reconcile(tx), {
      isolationLevel: 'RepeatableRead',
    });
    expect(restored).toEqual(good);
    await expect(
      pool.query(
        "UPDATE ledger_entries SET debit=debit-1 WHERE journal_id='00000000-0000-4000-8000-000000000003' AND debit>0",
      ),
    ).rejects.toThrow('immutable');
  });
  it('simultaneous same HTTP key has one immutable receipt, and revoked role cannot replay it', async () => {
    const op = await reader(['TEST_OPERATOR']),
      member = await reader(),
      body = await event(member),
      key = randomUUID();
    const gate = await block('users', member.id);
    const calls = Array.from({ length: 20 }, () =>
      emit(body, op, key).then((r) => r),
    );
    try {
      await reached(gate);
    } finally {
      await gate.connection.query('COMMIT');
      gate.connection.release();
    }
    const results = await Promise.all(calls);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await available(member)).toBe(body.amount);
    await db.userRole.deleteMany({ where: { userId: op.id } });
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
    const total = Number(
      (
        await pool.query(
          'SELECT sum(debit-credit)::bigint n FROM ledger_entries WHERE account_id=$1',
          [CLEARING_ID],
        )
      ).rows[0].n,
    );
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
      gate = await block('wallet_accounts', CLEARING_ID);
    const calls = [
      emit(ea).then((r) => r.status),
      emit(eb, otherOperator).then((r) => r.status),
    ];
    try {
      await reached(gate);
    } finally {
      await gate.connection.query('COMMIT');
      gate.connection.release();
    }
    expect((await Promise.all(calls)).sort()).toEqual([200, 503]);
    expect((await available(a)) + (await available(b))).toBe(10000000);
    expect(
      Number(
        (
          await pool.query(
            'SELECT sum(debit-credit)::bigint n FROM ledger_entries WHERE account_id=$1',
            [CLEARING_ID],
          )
        ).rows[0].n,
      ),
    ).toBe(0);
    expect(
      await db.ledgerJournal.count({ where: { type: 'OpeningCapital' } }),
    ).toBe(1);
    // Bypass only the application balance check in this test: the SQL constraint
    // must still reject a fully shaped journal that would overdraw the source.
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
