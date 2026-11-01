import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { Gate } from './helpers/mongo-gate.js';
import { validates } from './helpers/contract.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PurchasesService } from '../src/modules/purchases/purchases.service.js';
type Reader = { id: string; sid: string; token: string };
describe('Admin account controls: real HTTP/Mongo and current permission', () => {
  let app: INestApplication, db: MongoFixtures, admin: Reader, target: Reader;
  const body = {
    expectedVersion: 1,
    reason: 'QA kiểm tra tài khoản',
    unlockCondition: 'Đã xác minh hồ sơ',
    relatedReference: 'QA-ACCOUNT-1',
  };
  async function reader(
    roles: RoleCode[] = ['MEMBER'],
    status: UserStatus = 'ACTIVE',
  ) {
    const u = await db.user({ roles, status }),
      sid = await db.session(u._id);
    return {
      id: u._id,
      sid,
      token: await app.get(JwtService).signAsync({ sub: u._id, sid }),
    };
  }
  const get = (path: string, who = admin) =>
    request(app.getHttpServer())
      .get('/api/v1' + path)
      .auth(who.token, { type: 'bearer' });
  const post = (
    action: string,
    value: object = body,
    who = admin,
    key = randomUUID(),
    id = target.id,
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/operations/users/${id}/${action}`)
      .auth(who.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(value);
  const history = (who = admin, id = target.id) =>
    get(`/operations/users/${id}/history?limit=2`, who);
  beforeAll(async () => {
    const m = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = m.createNestApplication();
    configureApp(app, { logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
  });
  beforeEach(async () => {
    admin = await reader(['ADMIN']);
    target = await reader();
  });
  afterAll(async () => {
    await db?.close();
    await app?.close();
  });
  it('requires ACTIVE ADMIN, rejects self/status/overposting and unknown targets', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/operations/users/${target.id}`)
      .expect(401);
    for (const who of [
      target,
      await reader(['STAFF']),
      await reader(['ADMIN'], 'RESTRICTED'),
      await reader(['ADMIN'], 'LOCKED'),
    ]) {
      await get(`/operations/users/${target.id}`, who).expect(403);
      await history(who).expect(403);
      await post('lock', body, who).expect(403);
    }
    await post('lock', body, admin, randomUUID(), admin.id).expect(403);
    await post('lock', { ...body, status: 'ACTIVE' }).expect(422);
    await post('lock', { ...body, reason: '   ' }).expect(422);
    await post('lock', body, admin, randomUUID(), randomUUID()).expect(404);
    for (const state of ['PENDING_VERIFICATION', 'DISABLED'] as const) {
      const user = await reader(['MEMBER'], state);
      await post('lock', body, admin, randomUUID(), user.id).expect(409);
    }
    await post('unlock', {
      expectedVersion: 1,
      reason: 'Không khóa',
      restoreStatus: 'ACTIVE',
    }).expect(409);
  });
  it('locks exactly once, preserves sessions/roles/profile/money, blocks new trades and permits personal obligation reads', async () => {
    const before = await db.c.users.findOne({ _id: target.id }),
      key = randomUUID();
    const first = await post('lock', body, admin, key).expect(200);
    validates('AccountCommandReceipt', first.body);
    expect(first.body).toMatchObject({
      entityType: 'UserAccount',
      entityId: target.id,
      version: 2,
      state: 'LOCKED',
    });
    expect((await post('lock', body, admin, key).expect(200)).body).toEqual(
      first.body,
    );
    await post('lock', { ...body, reason: 'Changed' }, admin, key).expect(409);
    const row = (await db.c.users.findOne({ _id: target.id }))!;
    expect(row.roles).toEqual(before!.roles);
    expect(row.passwordHash).toBe(before!.passwordHash);
    expect(row.emailNormalized).toBe(before!.emailNormalized);
    expect(
      (await db.c.auth_sessions.findOne({ _id: target.sid }))!.revokedAt,
    ).toBeNull();
    expect(
      await db.c.mutation_receipts.countDocuments({ accountId: target.id }),
    ).toBe(1);
    const h = await history().expect(200);
    validates('AccountControlEventPage', h.body);
    expect(h.body.items[0]).toMatchObject({
      actorId: admin.id,
      action: 'AccountLocked',
      fromStatus: 'ACTIVE',
      toStatus: 'LOCKED',
      reason: body.reason,
      unlockCondition: body.unlockCondition,
      relatedReference: body.relatedReference,
    });
    await get('/me/profile', target).expect(200);
    await get('/me/wallet', target).expect(200);
    await get('/me/orders', target).expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/me/topups')
      .auth(target.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ amount: 200000 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/orders/buy-now')
      .auth(target.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(403);
    expect(
      await db.c.ledger_journals.countDocuments({ actorId: target.id }),
    ).toBe(0);
  });
  it.each(['ACTIVE', 'RESTRICTED'] as const)(
    'restores recorded %s, rejects clearing a preserved restriction and never changes violation records',
    async (status) => {
      await db.setStatus(target.id, status);
      await post('lock').expect(200);
      const detail = await get(`/operations/users/${target.id}`).expect(200);
      validates('OperationsAccount', detail.body);
      expect(detail.body.lock.restoreStatus).toBe(status);
      const violations = await db.c.member_violations.countDocuments({
        userId: target.id,
      });
      await post('unlock', {
        expectedVersion: 2,
        reason: 'QA mở',
        restoreStatus: status === 'ACTIVE' ? 'RESTRICTED' : 'ACTIVE',
      }).expect(409);
      const b = {
          expectedVersion: 2,
          reason: 'QA đã xác minh',
          restoreStatus: status,
        },
        key = randomUUID();
      const r = await post('unlock', b, admin, key).expect(200);
      expect(r.body.state).toBe(status);
      expect((await post('unlock', b, admin, key).expect(200)).body).toEqual(
        r.body,
      );
      expect(
        (await get(`/operations/users/${target.id}`).expect(200)).body.lock,
      ).toBeNull();
      expect(
        await db.c.member_violations.countDocuments({ userId: target.id }),
      ).toBe(violations);
      expect(
        (await history().expect(200)).body.items.map(
          (e: { action: string }) => e.action,
        ),
      ).toEqual(['AccountUnlocked', 'AccountLocked']);
    },
  );
  it('requires an explicit audited choice for legacy LOCKED accounts', async () => {
    await db.setStatus(target.id, 'LOCKED');
    await post('unlock', {
      expectedVersion: 1,
      reason: 'Legacy thiếu trạng thái',
    }).expect(422);
    await post('unlock', {
      expectedVersion: 1,
      reason: 'QA xác nhận tiếp tục hạn chế',
      restoreStatus: 'RESTRICTED',
    }).expect(200);
    expect((await history().expect(200)).body.items[0]).toMatchObject({
      fromStatus: 'LOCKED',
      toStatus: 'RESTRICTED',
      unlockCondition: null,
    });
  });
  it('rejects stale version after profile editing and rolls status/receipt back if the immutable audit fails', async () => {
    await db.c.users.updateOne({ _id: target.id }, { $set: { version: 2 } });
    await post('lock').expect(409);
    const key = randomUUID(),
      b = { ...body, expectedVersion: 2 };
    await db.withRejectingValidator(
      'audit_events',
      { accountId: target.id, action: 'lockUserAccount' },
      async () => {
        await post('lock', b, admin, key).expect(500);
      },
    );
    expect((await db.c.users.findOne({ _id: target.id }))!.status).toBe(
      'ACTIVE',
    );
    expect(
      await db.c.mutation_receipts.countDocuments({ accountId: target.id }),
    ).toBe(0);
    await post('lock', b, admin, key).expect(200);
  });
  it('serializes genuinely contended target decisions into one version/effect', async () => {
    const second = await reader(['ADMIN']),
      gate = await Gate.lockUser(db.client, target.id);
    const a = post('lock').then((r) => r),
      b = post('lock', { ...body, reason: 'QA đồng thời' }, second).then(
        (r) => r,
      );
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    expect((await Promise.all([a, b])).map((r) => r.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await db.c.audit_events.countDocuments({
        accountId: target.id,
        action: 'lockUserAccount',
      }),
    ).toBe(1);
  });
  it('current actor authority and session win a real wait before receipt replay', async () => {
    const key = randomUUID();
    await post('lock', body, admin, key).expect(200);
    const gate = await Gate.lockUser(db.client, admin.id),
      replay = post('lock', body, admin, key).then((r) => r);
    try {
      await gate.contended();
      await gate.db
        .collection('users')
        .updateOne(
          { _id: admin.id },
          { $set: { status: 'LOCKED' } },
          { session: gate.session },
        );
      await gate.commit();
    } finally {
      await gate.close();
    }
    expect((await replay).status).toBe(403);
    await db.setStatus(admin.id, 'ACTIVE');
    await db.removeRole(admin.id, 'ADMIN');
    await post('lock', body, admin, key).expect(403);
    await db.addRole(admin.id, 'ADMIN');
    await db.c.auth_sessions.updateOne(
      { _id: admin.sid },
      { $set: { revokedAt: new Date() } },
    );
    await post('lock', body, admin, key).expect(401);
  });
  it('prevents two Admins simultaneously locking each other from removing both active operators', async () => {
    const second = await reader(['ADMIN']),
      gate = await Gate.lock(db.client, 'users', [admin.id, second.id]);
    const a = post('lock', body, admin, randomUUID(), second.id).then((r) => r),
      b = post('lock', body, second, randomUUID(), admin.id).then((r) => r);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    expect((await Promise.all([a, b])).map((r) => r.status).sort()).toEqual([
      200, 403,
    ]);
    expect(
      await db.c.users.countDocuments({
        _id: { $in: [admin.id, second.id] },
        status: 'ACTIVE',
      }),
    ).toBe(1);
  });
  it('binds history pagination to current Admin and target without duplicates', async () => {
    for (let i = 0; i < 3; i++) {
      await post('lock', { ...body, expectedVersion: 1 + i * 2 }).expect(200);
      await post('unlock', {
        expectedVersion: 2 + i * 2,
        reason: 'QA mở ' + i,
        restoreStatus: 'ACTIVE',
      }).expect(200);
    }
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = (
        await get(
          `/operations/users/${target.id}/history?limit=2${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
        ).expect(200)
      ).body;
      validates('AccountControlEventPage', page);
      for (const e of page.items) {
        expect(seen.has(e.id)).toBe(false);
        seen.add(e.id);
      }
      cursor = page.nextCursor;
      if (cursor)
        await get(
          `/operations/users/${admin.id}/history?limit=2&cursor=${encodeURIComponent(cursor)}`,
        ).expect(400);
    } while (cursor);
    expect(seen.size).toBe(6);
  });
  it('locked participants cannot use unlinked negotiation or forged order chat, and socket authority is rechecked', async () => {
    const seller = await reader(),
      now = new Date(),
      id = randomUUID();
    await db.c.purchase_conversations.insertOne({
      _id: id,
      listingId: randomUUID(),
      listingVersion: 1,
      buyerId: target.id,
      sellerId: seller.id,
      version: 1,
      status: 'Active',
      expiresAt: new Date(Date.now() + 60000),
      quoteId: null,
      orderId: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    const auth = await app.get(AuthService).authenticate(target.token);
    await post('lock').expect(200);
    expect(
      (await get('/me/purchase-conversations', target).expect(200)).body,
    ).toEqual([]);
    await get(`/me/purchase-conversations/${id}`, target).expect(403);
    await get(`/me/purchase-conversations/${id}/messages`, target).expect(403);
    await expect(
      app
        .get(PurchasesService)
        .send(auth, {
          messageId: randomUUID(),
          conversationId: id,
          body: 'QA blocked new negotiation',
        }),
    ).rejects.toMatchObject({ status: 403 });
    await db.c.purchase_conversations.updateOne(
      { _id: id },
      {
        $set: {
          status: 'OrderCreated',
          orderId: randomUUID(),
          expiresAt: null,
          closedAt: now,
        },
      },
    );
    await get(`/me/purchase-conversations/${id}`, target).expect(403);
  });
});
