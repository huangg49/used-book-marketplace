import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MongoClient } from 'mongodb';
import { prepareDatabase, testUrl } from './mongo/harness.js';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode } from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { Gate } from './helpers/mongo-gate.js';
import { validates } from './helpers/contract.js';

type Actor = { id: string; token: string; sessionId: string };
describe('Withdrawal: HTTP, real Mongo ledger, permission and concurrency', () => {
  let scopedRootUrl: string | undefined;
  let app: INestApplication, db: MongoFixtures, admin: Actor, operator: Actor;
  const users: string[] = [];
  const oldSecret = process.env.PAYMENT_SIMULATOR_SECRET;
  const post = (path: string, body: object, actor: Actor, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const get = (path: string, actor: Actor) =>
    request(app.getHttpServer())
      .get('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`);
  async function actor(roles: RoleCode[] = ['MEMBER']) {
    const u = await db.user({ roles });
    users.push(u._id);
    const sessionId = await db.session(u._id);
    return {
      id: u._id,
      sessionId,
      token: await app
        .get(JwtService)
        .signAsync({ sub: u._id, sid: sessionId }),
    };
  }
  async function funded(roles: RoleCode[] = ['MEMBER']) {
    const u = await actor(roles);
    await post(
      '/operations/simulator/topups',
      { recipientId: u.id, amount: 200000 },
      operator,
    ).expect(200);
    return u;
  }
  const body = (amount = 100000) => ({
    amount,
    reason: 'Personal',
    reasonDetail: '',
    recipient: {
      bankName: 'Ngân hàng mô phỏng',
      accountNumber: '0123456789',
      accountHolder: 'NGUOI THU',
    },
  });
  const summary = async (u: Actor) =>
    (await get('/me/wallet', u).expect(200)).body;
  const read = async (u: Actor, id: string) =>
    (await get('/me/withdrawals/' + id, u).expect(200)).body;
  async function create(u: Actor, amount = 100000) {
    const r = await post('/me/withdrawals', body(amount), u).expect(200);
    validates('WithdrawalReceipt', r.body);
    return r.body;
  }
  async function approve(id: string, version = 1) {
    return (
      await post(
        `/admin/withdrawals/${id}/decision`,
        {
          expectedVersion: version,
          decision: 'Approve',
          reason: 'Đã đối chiếu thông tin',
        },
        admin,
      ).expect(200)
    ).body;
  }
  async function processing(u: Actor) {
    const w = await create(u);
    // Historical requests predate manual mode and retain their processing semantics.
    await db.c.withdrawals.updateOne(
      { _id: w.entityId },
      { $unset: { processingMode: '' } },
    );
    await approve(w.entityId);
    await post(
      `/admin/withdrawals/${w.entityId}/process`,
      { expectedVersion: 2 },
      admin,
    ).expect(200);
    return read(u, w.entityId);
  }
  const evidence = (
    w: Awaited<ReturnType<typeof read>>,
    outcome = 'Succeeded',
  ) => ({
    eventId: randomUUID(),
    withdrawalId: w.id,
    expectedVersion: w.version,
    payoutRef: w.payoutRef,
    recipientId: w.ownerId,
    amount: w.amount,
    currency: 'VND',
    outcome,
  });
  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    // Financial reconciliation must see complete chains from this suite, not
    // partial historical aggregates inserted by support/work-inbox fixtures.
    scopedRootUrl = testUrl(`withdrawals_${randomUUID().replaceAll('-', '')}_test`);
    const { appUrl, migratorUrl } = await prepareDatabase(scopedRootUrl);
    db = await MongoFixtures.connect(migratorUrl);
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MongoService)
      .useValue(new MongoService(new ConfigService({ MONGODB_URL: appUrl })))
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    await app.listen(0, '127.0.0.1');
    admin = await actor(['ADMIN']);
    operator = await actor(['TEST_OPERATOR']);
  }, 60000);
  afterAll(async () => {
    try {
      try {
        await app?.close();
      } finally {
        try {
          await db?.close();
        } finally {
          if (scopedRootUrl) {
            const root = new MongoClient(scopedRootUrl);
            try {
              await root.connect();
              const owned = root.db();
              if (!/^withdrawals_[a-f0-9]{32}_test$/.test(owned.databaseName))
                throw new Error('Refusing cleanup outside the owned withdrawal QA database');
              await owned.dropDatabase();
              await owned.command({ dropAllUsersFromDatabase: 1 });
              await owned.command({ dropAllRolesFromDatabase: 1 });
              expect((await owned.command({ usersInfo: 1 })).users).toEqual([]);
              expect((await owned.command({ rolesInfo: 1 })).roles).toEqual([]);
              expect((await root.db('admin').command({
                listDatabases: 1, nameOnly: true, filter: { name: owned.databaseName },
              })).databases).toEqual([]);
            } finally {
              await root.close();
            }
          }
        }
      }
    } finally {
      if (oldSecret === undefined) delete process.env.PAYMENT_SIMULATOR_SECRET;
      else process.env.PAYMENT_SIMULATOR_SECRET = oldSecret;
    }
  }, 60000);

  it('accepts an arbitrary account without simulator config; Admin approval completes and debits exactly once', async () => {
    const u = await funded(),
      key = randomUUID();
    const { PaymentSimulator } =
      await import('../src/modules/wallet/payment-simulator.js');
    const disabled = vi
      .spyOn(app.get(PaymentSimulator), 'enabled')
      .mockReturnValue(false);
    try {
      const payload = {
        ...body(),
        recipient: { ...body().recipient, accountNumber: '123456' },
      };
      const created = await post('/me/withdrawals', payload, u, key).expect(
        200,
      );
      expect(await summary(u)).toMatchObject({
        withdrawalsEnabled: true,
        available: 100000,
        withdrawalHeld: 100000,
      });
      expect((await read(u, created.body.entityId)).processingMode).toBe(
        'Manual',
      );
      const decision = {
          expectedVersion: 1,
          decision: 'Approve',
          reason: 'Đã duyệt yêu cầu',
        },
        approvalKey = randomUUID();
      const approved = await post(
        `/admin/withdrawals/${created.body.entityId}/decision`,
        decision,
        admin,
        approvalKey,
      ).expect(200);
      expect(approved.body).toMatchObject({ state: 'Completed', version: 2 });
      expect(
        (
          await post(
            `/admin/withdrawals/${created.body.entityId}/decision`,
            decision,
            admin,
            approvalKey,
          ).expect(200)
        ).body,
      ).toEqual(approved.body);
      expect(await summary(u)).toMatchObject({
        available: 100000,
        withdrawalHeld: 0,
        total: 100000,
      });
      expect(
        await db.c.withdrawal_events.countDocuments({
          withdrawalId: created.body.entityId,
        }),
      ).toBe(0);
      expect(
        await db.c.ledger_journals.countDocuments({
          withdrawalId: created.body.entityId,
          type: 'WithdrawalPayout',
        }),
      ).toBe(1);
    } finally {
      disabled.mockRestore();
    }
  });
  it('requires reason, minimum, valid recipient and detail for Other; no partial reserve', async () => {
    const u = await funded();
    await post('/me/withdrawals', { ...body(), reason: '' }, u).expect(422);
    await post('/me/withdrawals', body(49999), u).expect(422);
    await post('/me/withdrawals', { ...body(), reason: 'Other' }, u).expect(
      422,
    );
    await post(
      '/me/withdrawals',
      { ...body(), recipient: { ...body().recipient, accountNumber: 'abc' } },
      u,
    ).expect(422);
    expect((await summary(u)).available).toBe(200000);
  });
  it('reserves once, exposes history and masks recipient; same key replays and changed body conflicts', async () => {
    const u = await funded(),
      key = randomUUID();
    const first = await post('/me/withdrawals', body(), u, key).expect(200);
    const repeat = await post('/me/withdrawals', body(), u, key).expect(200);
    expect(repeat.body).toEqual(first.body);
    expect(repeat.headers['idempotency-replayed']).toBe('true');
    await post('/me/withdrawals', body(50000), u, key).expect(409);
    const s = await summary(u);
    expect(s).toMatchObject({
      available: 100000,
      withdrawalHeld: 100000,
      total: 200000,
      withdrawalsEnabled: true,
    });
    validates('WalletSummary', s);
    const w = await read(u, first.body.entityId);
    validates('Withdrawal', w);
    expect(w.recipient.accountNumber).not.toBe(body().recipient.accountNumber);
    const h = (
      await get('/me/wallet/history?type=WithdrawalHold&limit=20', u).expect(
        200,
      )
    ).body;
    validates('WalletHistoryPage', h);
    expect(h.items[0]).toMatchObject({
      type: 'WithdrawalHold',
      amount: -100000,
      withdrawalId: w.id,
      balanceAfter: 100000,
    });
  });
  it('refuses other owners, member decisions, Staff decisions and self approval', async () => {
    const u = await funded(['MEMBER', 'ADMIN']),
      other = await actor(),
      staff = await actor(['STAFF']),
      w = await create(u);
    await get('/me/withdrawals/' + w.entityId, other).expect(404);
    for (const who of [u, other, staff])
      await post(
        `/admin/withdrawals/${w.entityId}/decision`,
        { expectedVersion: 1, decision: 'Approve', reason: 'Đủ thông tin' },
        who,
      ).expect(403);
  });
  it('reauthenticates before receipt replay; locked user can read but cannot create/replay a new withdrawal', async () => {
    const u = await funded(),
      key = randomUUID();
    await post('/me/withdrawals', body(), u, key).expect(200);
    await db.setStatus(u.id, 'LOCKED');
    await post('/me/withdrawals', body(), u, key).expect(403);
    expect((await summary(u)).withdrawalsEnabled).toBe(false);
    await get('/me/withdrawals?limit=20', u).expect(200);
  });
  it('requires a recent Admin session and checks current permission before replay', async () => {
    const u = await funded(),
      w = await create(u),
      a = await actor(['ADMIN']),
      key = randomUUID(),
      decision = {
        expectedVersion: 1,
        decision: 'Approve',
        reason: 'Đã kiểm tra',
      };
    await db.c.auth_sessions.updateOne(
      { _id: a.sessionId },
      { $set: { createdAt: new Date(Date.now() - 16 * 60000) } },
    );
    await post(
      `/admin/withdrawals/${w.entityId}/decision`,
      decision,
      a,
      key,
    ).expect(403);
    await db.c.auth_sessions.updateOne(
      { _id: a.sessionId },
      { $set: { createdAt: new Date() } },
    );
    await post(
      `/admin/withdrawals/${w.entityId}/decision`,
      decision,
      a,
      key,
    ).expect(200);
    await db.removeRole(a.id, 'ADMIN');
    await post(
      `/admin/withdrawals/${w.entityId}/decision`,
      decision,
      a,
      key,
    ).expect(403);
  });
  it('rejection releases exactly this hold, with reason, receipt, history and notification', async () => {
    const u = await funded(),
      w = await create(u);
    await post(
      `/admin/withdrawals/${w.entityId}/decision`,
      {
        expectedVersion: 1,
        decision: 'Reject',
        reason: 'Sai thông tin nhận tiền',
      },
      admin,
    ).expect(200);
    expect(await summary(u)).toMatchObject({
      available: 200000,
      withdrawalHeld: 0,
      total: 200000,
    });
    expect((await read(u, w.entityId)).history.at(-1).note).toBe(
      'Sai thông tin nhận tiền',
    );
    expect(
      await db.c.member_notifications.countDocuments({
        userId: u.id,
        kind: 'WithdrawalUpdated',
      }),
    ).toBe(2);
  });
  it('approval does not pay; uncertain result retains hold and one payout reference; success pays once', async () => {
    const u = await funded(),
      w = await processing(u),
      unknown = evidence(w, 'Unknown');
    await post(
      '/operations/simulator/withdrawal-events',
      unknown,
      operator,
    ).expect(200);
    expect(await summary(u)).toMatchObject({
      available: 100000,
      withdrawalHeld: 100000,
      total: 200000,
    });
    await post(
      `/admin/withdrawals/${w.id}/process`,
      { expectedVersion: 4 },
      admin,
    ).expect(409);
    await post(
      `/admin/withdrawals/${w.id}/refund`,
      { expectedVersion: 4 },
      admin,
    ).expect(409);
    const next = await read(u, w.id);
    expect(next.payoutRef).toBe(w.payoutRef);
    const event = evidence(next);
    await post(
      '/operations/simulator/withdrawal-events',
      event,
      operator,
    ).expect(200);
    await post(
      '/operations/simulator/withdrawal-events',
      event,
      operator,
    ).expect(200);
    expect(await summary(u)).toMatchObject({
      available: 100000,
      withdrawalHeld: 0,
      total: 100000,
    });
    expect(
      await db.c.ledger_journals.countDocuments({
        withdrawalId: w.id,
        type: 'WithdrawalPayout',
      }),
    ).toBe(1);
    await post(
      `/admin/withdrawals/${w.id}/refund`,
      { expectedVersion: 5 },
      admin,
    ).expect(409);
  });
  it('verified failure requires explicit refund; cannot later succeed or refund twice', async () => {
    const u = await funded(),
      w = await processing(u);
    await post(
      '/operations/simulator/withdrawal-events',
      evidence(w, 'FailedVerified'),
      operator,
    ).expect(200);
    expect((await summary(u)).withdrawalHeld).toBe(100000);
    const key = randomUUID();
    await post(
      `/admin/withdrawals/${w.id}/refund`,
      { expectedVersion: 4 },
      admin,
      key,
    ).expect(200);
    await post(
      `/admin/withdrawals/${w.id}/refund`,
      { expectedVersion: 4 },
      admin,
      key,
    ).expect(200);
    expect(await summary(u)).toMatchObject({
      available: 200000,
      withdrawalHeld: 0,
    });
    await post(
      '/operations/simulator/withdrawal-events',
      evidence({ ...w, version: 5 }),
      operator,
    ).expect(409);
  });
  it('rejects mismatched evidence, duplicate event identities with other content and stale decisions', async () => {
    const u = await funded(),
      w = await processing(u);
    const event = evidence(w, 'Unknown');
    await post(
      '/operations/simulator/withdrawal-events',
      { ...event, amount: 50000 },
      operator,
    ).expect(409);
    await post(
      '/operations/simulator/withdrawal-events',
      event,
      operator,
    ).expect(200);
    await post(
      '/operations/simulator/withdrawal-events',
      { ...event, outcome: 'Succeeded' },
      operator,
    ).expect(409);
    await post(
      `/admin/withdrawals/${w.id}/decision`,
      { expectedVersion: 1, decision: 'Reject', reason: 'Thông tin sai' },
      admin,
    ).expect(409);
    expect((await summary(u)).withdrawalHeld).toBe(100000);
  });
  it('two simultaneous withdrawals cannot overspend: both contend on an actual Mongo write lock', async () => {
    const u = await funded(),
      gate = await Gate.lockUser(db.client, u.id);
    const a = post('/me/withdrawals', body(150000), u).then((r) => r),
      b = post('/me/withdrawals', body(150000), u).then((r) => r);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    const results = await Promise.all([a, b]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await summary(u)).toMatchObject({
      available: 50000,
      withdrawalHeld: 150000,
      total: 200000,
    });
  });
  it('simultaneous approve/reject yields one decision and one state transition', async () => {
    const u = await funded(),
      w = await create(u),
      gate = await Gate.lockUser(db.client, u.id);
    const path = `/admin/withdrawals/${w.entityId}/decision`;
    const a = post(
        path,
        { expectedVersion: 1, decision: 'Approve', reason: 'Đã đối chiếu' },
        admin,
      ).then((r) => r),
      b = post(
        path,
        { expectedVersion: 1, decision: 'Reject', reason: 'Sai thông tin' },
        admin,
      ).then((r) => r);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    expect((await Promise.all([a, b])).map((r) => r.status).sort()).toEqual([
      200, 409,
    ]);
    expect((await read(u, w.entityId)).version).toBe(2);
  });
  it('reconciles all journals, holds, receipts and simulator capital after every outcome', async () => {
    const result = await app
      .get(MongoService)
      .tx((tx) => app.get(LedgerService).reconcile(tx));
    expect(result.balanced).toBe(true);
  });
});
