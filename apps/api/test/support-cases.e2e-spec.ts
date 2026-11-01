import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { Gate } from './helpers/mongo-gate.js';
import type { ExchangeDoc, RoleCode } from '../src/database/mongo/documents.js';
import { validates } from './helpers/contract.js';

type Reader = { id: string; sid: string; token: string };
describe('Private support cases — real HTTP/Mongo, no fulfillment acceptance', () => {
  let app: INestApplication,
    db: MongoFixtures,
    a: Reader,
    b: Reader,
    admin: Reader,
    second: Reader,
    staff: Reader;
  const input = {
    kind: 'Feedback',
    title: 'Góp ý tìm sách',
    description: 'Tôi muốn bổ sung bộ lọc tình trạng sách.',
    target: null,
  };
  const get = (path: string, who = a) =>
    request(app.getHttpServer())
      .get('/api/v1' + path)
      .auth(who.token, { type: 'bearer' });
  const post = (path: string, body: object, who = a, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .auth(who.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(body);
  const create = async (body: object = input, who = a) =>
    (await post('/me/support-cases', body, who).expect(200)).body;
  const ops = (id: string) => `/operations/support-cases/${id}`;
  const mine = (id: string) => `/me/support-cases/${id}`;
  const action = (
    id: string,
    version: number,
    act: string,
    who = admin,
    text = 'Thông tin xử lý từ quản trị viên',
  ) =>
    post(
      ops(id) + '/actions',
      { expectedVersion: version, action: act, text },
      who,
    );
  async function reader(roles: RoleCode[] = ['MEMBER']): Promise<Reader> {
    const u = await db.user({ roles }),
      sid = await db.session(u._id);
    return {
      id: u._id,
      sid,
      token: await app.get(JwtService).signAsync({ sub: u._id, sid }),
    };
  }
  async function exchange(status: ExchangeDoc['status'] = 'Completed') {
    const now = new Date(),
      id = randomUUID();
    await db.c.exchanges.insertOne({
      _id: id,
      initiatorId: a.id,
      recipientId: b.id,
      initiatorListingId: randomUUID(),
      recipientListingId: randomUUID(),
      initiatorOrderId: randomUUID(),
      recipientOrderId: randomUUID(),
      status,
      revision: 1,
      initiatorDeposit: 100000,
      recipientDeposit: 100000,
      diffAmount: 0,
      diffPayerId: null,
      fundingDeadline: null,
      initiatorFundedAt: null,
      recipientFundedAt: null,
      proposalExpiresAt: null,
      rejectionReason: null,
      cancelReason: null,
      cancelledBy: null,
      cancelledAt: null,
      initiatorShippedAt: null,
      recipientShippedAt: null,
      initiatorReceivedAt: null,
      recipientReceivedAt: null,
      inspectionDeadline: null,
      completedAt: status === 'Completed' ? now : null,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    return id;
  }
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
    admin = await reader(['ADMIN']);
    second = await reader(['ADMIN']);
    staff = await reader(['STAFF']);
  }, 60000);
  beforeEach(async () => {
    a = await reader();
    b = await reader();
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('validates auth, role, shape, whitespace, target and creation status', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/support-cases')
      .expect(401);
    await post('/me/support-cases', input, staff).expect(403);
    await post('/me/support-cases', { ...input, assigneeId: admin.id }).expect(
      422,
    );
    await post('/me/support-cases', { ...input, title: '   ' }).expect(422);
    await post('/me/support-cases', { ...input, kind: 'Violation' }).expect(
      422,
    );
    await post('/me/support-cases', {
      ...input,
      kind: 'TransactionIssue',
    }).expect(422);
    await post('/me/support-cases', {
      ...input,
      kind: 'TransactionIssue',
      target: { type: 'Exchange', id: randomUUID() },
    }).expect(404);
    await db.setStatus(a.id, 'LOCKED');
    await post('/me/support-cases', input).expect(403);
  });
  it('creates once, replays exact receipt, rejects key/body conflict and foreign reads', async () => {
    const key = randomUUID(),
      r = await post('/me/support-cases', input, a, key).expect(200),
      id = r.body.entityId;
    validates('SupportCaseReceipt', r.body);
    const replay = await post('/me/support-cases', input, a, key).expect(200);
    expect(replay.body).toEqual(r.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await post(
      '/me/support-cases',
      { ...input, title: 'Nội dung khác' },
      a,
      key,
    ).expect(409);
    expect(await db.c.support_messages.countDocuments({ caseId: id })).toBe(1);
    await get(mine(id), b).expect(404);
    await get(ops(id), a).expect(403);
    await get(ops(id), staff).expect(403);
    validates('SupportCaseDetail', (await get(mine(id)).expect(200)).body);
  });
  it('requires assignment, protects internal notes, requests evidence, answers and closes after ACK', async () => {
    const r = await create(),
      id = r.entityId;
    await post(
      ops(id) + '/messages',
      { expectedVersion: 1, text: 'Chưa nhận phân công', internal: false },
      admin,
    ).expect(409);
    await action(id, 1, 'Close').expect(409);
    await action(id, 1, 'Assign').expect(200);
    await post(
      ops(id) + '/messages',
      { expectedVersion: 2, text: 'Ghi chú điều tra riêng tư', internal: true },
      admin,
    ).expect(200);
    const member = (await get(mine(id)).expect(200)).body,
      operation = (await get(ops(id), admin).expect(200)).body;
    expect(member.messages.some((m: any) => m.text.includes('riêng tư'))).toBe(
      false,
    );
    expect(operation.messages.some((m: any) => m.internal)).toBe(true);
    expect(
      await db.c.member_notifications.countDocuments({ targetId: id }),
    ).toBe(1);
    await action(id, 3, 'RequestEvidence').expect(200);
    expect((await get(mine(id)).expect(200)).body.case.state).toBe(
      'AwaitingMember',
    );
    await post(mine(id) + '/messages', {
      expectedVersion: 4,
      text: 'Thông tin bổ sung từ thành viên',
      internal: true,
    }).expect(403);
    await post(mine(id) + '/messages', {
      expectedVersion: 4,
      text: 'Thông tin bổ sung từ thành viên',
      internal: false,
    }).expect(200);
    expect((await get(mine(id)).expect(200)).body.case.state).toBe('InReview');
    await action(id, 5, 'Answer').expect(200);
    await action(id, 6, 'Close').expect(200);
    await post(mine(id) + '/messages', {
      expectedVersion: 7,
      text: 'Phản hồi sau đóng',
      internal: false,
    }).expect(409);
    await action(id, 7, 'Reopen').expect(200);
    expect((await get(mine(id)).expect(200)).body.canReply).toBe(true);
  });
  it('keeps locked members able to read and supplement their existing case only', async () => {
    const id = (await create()).entityId;
    await db.setStatus(a.id, 'LOCKED');
    await get(mine(id)).expect(200);
    await get('/me/support-cases').expect(200);
    await post(mine(id) + '/messages', {
      expectedVersion: 1,
      text: 'Bổ sung nghĩa vụ đang có',
      internal: false,
    }).expect(200);
    await get(mine(id), b).expect(404);
    await post('/me/support-cases', input).expect(403);
  });
  it('checks current permission and independence before receipt replay', async () => {
    const id = (await create()).entityId,
      key = randomUUID(),
      body = {
        expectedVersion: 1,
        action: 'Assign',
        text: 'Tiếp nhận hồ sơ hỗ trợ',
      };
    await post(ops(id) + '/actions', body, admin, key).expect(200);
    await db.removeRole(admin.id, 'ADMIN');
    await post(ops(id) + '/actions', body, admin, key).expect(403);
    await db.addRole(admin.id, 'ADMIN');
    await db.c.auth_sessions.updateOne(
      { _id: admin.sid },
      { $set: { revokedAt: new Date() } },
    );
    await post(ops(id) + '/actions', body, admin, key).expect(401);
    admin = await reader(['ADMIN']);
    await db.addRole(a.id, 'ADMIN');
    await get(ops(id), a).expect(403);
    await action(id, 2, 'Answer', a).expect(403);
    expect(
      (await get('/operations/support-cases', a).expect(200)).body.items.find(
        (r: any) => r.id === id,
      ),
    ).toBeUndefined();
  });
  it('serializes two independent Admin assignments under genuine contention', async () => {
    const id = (await create()).entityId,
      gate = await Gate.lock(db.client, 'support_cases', [id]);
    const results = Promise.all([
      action(id, 1, 'Assign', admin).then((r) => r),
      action(id, 1, 'Assign', second).then((r) => r),
    ]);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    const rows = await results;
    expect(rows.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.c.support_messages.countDocuments({ caseId: id })).toBe(2);
    expect(
      await db.c.member_notifications.countDocuments({ targetId: id }),
    ).toBe(1);
  });
  it('replays a lost response without duplicating messages or durable notifications', async () => {
    const id = (await create()).entityId;
    await action(id, 1, 'Assign').expect(200);
    const key = randomUUID(),
      body = {
        expectedVersion: 2,
        text: 'Phản hồi xác nhận được lưu đúng một lần',
        internal: false,
      };
    const first = await post(ops(id) + '/messages', body, admin, key).expect(
      200,
    );
    const replay = await post(ops(id) + '/messages', body, admin, key).expect(
      200,
    );
    expect(replay.body).toEqual(first.body);
    expect(await db.c.support_messages.countDocuments({ caseId: id })).toBe(3);
    expect(
      await db.c.member_notifications.countDocuments({ targetId: id }),
    ).toBe(2);
    await post(
      ops(id) + '/messages',
      { ...body, text: 'Nội dung khác sau lỗi' },
      admin,
      key,
    ).expect(409);
    const notices = (await get('/me/notifications').expect(200)).body.items;
    expect(notices[0]).toMatchObject({
      targetType: 'SupportCase',
      targetId: id,
    });
  });
  it('rolls case, message and receipt back when durable notification cannot be stored', async () => {
    const id = (await create()).entityId;
    await action(id, 1, 'Assign').expect(200);
    await db.withRejectingValidator(
      'member_notifications',
      { targetId: id },
      async () => {
        await action(id, 2, 'Answer').expect(500);
      },
    );
    expect((await get(mine(id)).expect(200)).body.case).toMatchObject({
      version: 2,
      state: 'InReview',
    });
    expect(await db.c.support_messages.countDocuments({ caseId: id })).toBe(2);
    expect(
      await db.c.mutation_receipts.countDocuments({
        supportCaseId: id,
        operation: 'actOnSupportCase',
      }),
    ).toBe(1);
  });
  it('binds pagination to caller and filters, with no private title leakage', async () => {
    await create();
    await create({ ...input, title: 'Bộ lọc bổ sung' });
    const first = (await get('/me/support-cases?limit=1').expect(200)).body;
    expect(first.nextCursor).toBeTruthy();
    const path = `/me/support-cases?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`;
    const next = (await get(path).expect(200)).body;
    expect(next.items[0].id).not.toBe(first.items[0].id);
    await get(path, b).expect(400);
    await get(path + '&state=Closed').expect(400);
    expect((await get('/me/support-cases', b).expect(200)).body.items).toEqual(
      [],
    );
  });
  it('validates transaction ownership, excludes the counterparty and does not adjudicate money', async () => {
    const id = await exchange('ResolutionPending'),
      body = {
        ...input,
        kind: 'TransactionIssue',
        target: { type: 'Exchange', id },
      };
    const before = await db.c.ledger_journals.countDocuments({});
    const c = await create(body);
    await post('/me/support-cases', body, await reader()).expect(404);
    await db.addRole(b.id, 'ADMIN');
    await get(ops(c.entityId), b).expect(403);
    await action(c.entityId, 1, 'Assign').expect(200);
    await action(c.entityId, 2, 'Answer').expect(200);
    await action(c.entityId, 3, 'Close').expect(409);
    expect((await get(mine(c.entityId)).expect(200)).body.relatedState).toBe(
      'ResolutionPending',
    );
    expect(await db.c.ledger_journals.countDocuments({})).toBe(before);
    expect((await db.c.exchanges.findOne({ _id: id }))?.status).toBe(
      'ResolutionPending',
    );
  });
  it('reserves the last history slots for an answer and closure instead of trapping a full case', async () => {
    const id = (await create()).entityId;
    await action(id, 1, 'Assign').expect(200);
    // Synthetic capacity fixture; not an acceptance claim for 198 real messages.
    await db.c.support_cases.updateOne(
      { _id: id },
      { $set: { messageCount: 198 } },
    );
    await post(mine(id) + '/messages', {
      expectedVersion: 2,
      text: 'Nội dung vượt dung lượng',
      internal: false,
    }).expect(409);
    await action(id, 2, 'RequestEvidence').expect(409);
    await action(id, 2, 'Answer').expect(200);
    await action(id, 3, 'Close').expect(200);
    expect((await get(mine(id)).expect(200)).body.case.state).toBe('Closed');
  });
  it('binds DirectOrder and PointOrder support to the real participant and correct aggregate', async () => {
    const complete = new Date(Date.now() - 3600000),
      delivered = new Date(+complete - 72 * 3600000),
      created = new Date(+delivered - 3600000),
      paid = new Date(+created + 1000);
    const direct = randomUUID(),
      point = randomUUID(),
      auctionId = randomUUID();
    await db.c.direct_orders.insertOne({
      _id: direct,
      buyerId: a.id,
      sellerId: b.id,
      quoteId: randomUUID(),
      version: 6,
      state: 'Completed',
      createdAt: created,
      paymentDeadline: new Date(+created + 1800000),
      closedAt: complete,
      paidAt: paid,
      sellerConfirmationDeadline: new Date(+paid + 48 * 3600000),
      cancellationRequestedAt: null,
      cancellationReason: null,
      deliveredAt: delivered,
      inspectionDeadline: complete,
      completedAt: complete,
      lockSeq: 0,
    });
    await db.c.point_orders.insertOne({
      _id: point,
      source: 'Auction',
      auctionId,
      intakeId: randomUUID(),
      contextId: randomUUID(),
      listingId: randomUUID(),
      buyerId: a.id,
      sellerId: b.id,
      pointId: randomUUID(),
      fulfillmentMethod: 'SelfCollect',
      bookPrice: 100000,
      outboundFee: 0,
      buyerTotal: 100000,
      commissionBps: 500,
      commission: 5000,
      sellerProceeds: 95000,
      state: 'Completed',
      version: 5,
      createdAt: created,
      paymentDeadline: new Date(+created + 24 * 3600000),
      paidAt: paid,
      closedAt: complete,
      updatedAt: complete,
      acceptanceDeadline: new Date(+paid + 72 * 3600000),
      acceptedAt: new Date(+paid + 1000),
      collectionDeadline: new Date(+paid + 72 * 3600000 + 2000),
      collectedAt: delivered,
      inspectionDeadline: complete,
      resolutionReason: null,
      resolutionNote: null,
      resolutionOpenedAt: null,
      collectionOpenedAt: new Date(+paid + 1000),
      returnDeadline: null,
      returnedAt: null,
      dispatchedAt: null,
      deliveryDeadline: null,
      trackingCode: null,
      lockSeq: 0,
    });
    for (const [type, id] of [
      ['DirectOrder', direct],
      ['PointOrder', point],
    ]) {
      const body = { ...input, kind: 'TransactionIssue', target: { type, id } };
      const c = await create(body);
      const view = (await get(mine(c.entityId)).expect(200)).body;
      expect(view.case.target).toEqual({ type, id });
      expect(view.relatedState).toBe('Completed');
      if (type === 'PointOrder') expect(view.relatedAuctionId).toBe(auctionId);
      await post('/me/support-cases', body, await reader()).expect(404);
    }
  });
  it('rejects reporting a confidential review, then supports moderation and exact notification targets', async () => {
    const id = await exchange(),
      inputReview = {
        bookRating: 4,
        partnerRating: 3,
        comment: 'Nội dung kiểm thử đánh giá',
        tags: [],
      };
    const r = (
      await post(`/transactions/Exchange/${id}/reviews`, inputReview).expect(
        200,
      )
    ).body;
    await post(`/transactions/Exchange/${id}/reviews`, inputReview, b).expect(
      200,
    );
    const report = {
      ...input,
      kind: 'Violation',
      target: { type: 'Review', id: r.id },
    };
    await post('/me/support-cases', report).expect(404);
    await get(`/me/transaction-reviews/${r.id}/target`, b).expect(404);
    const createdAt = new Date(Date.now() - 49 * 3600000);
    await db.c.transaction_reviews.updateMany(
      { transactionId: id },
      {
        $set: { createdAt, editDeadline: new Date(+createdAt + 48 * 3600000) },
      },
    );
    const outsider = await reader(),
      c = await create(report, outsider);
    await action(c.entityId, 1, 'Assign').expect(200);
    const view = (await get(ops(c.entityId), admin).expect(200)).body;
    expect(view.review.id).toBe(r.id);
    const key = randomUUID(),
      decision = {
        expectedVersion: r.version,
        decision: 'Hide',
        reason: 'Nội dung vi phạm quy tắc đã xác minh',
      };
    await post(
      `/operations/transaction-reviews/${r.id}/decision`,
      decision,
      admin,
      key,
    ).expect(200);
    await post(
      `/operations/transaction-reviews/${r.id}/decision`,
      decision,
      admin,
      key,
    ).expect(200);
    expect(
      await db.c.member_notifications.countDocuments({ targetId: r.id }),
    ).toBe(2);
    expect(
      (await get(`/me/transaction-reviews/${r.id}/target`).expect(200)).body,
    ).toEqual({ type: 'Exchange', id });
    await get(`/me/transaction-reviews/${r.id}/target`, outsider).expect(404);
    expect(
      (await get(ops(c.entityId), admin).expect(200)).body.review.status,
    ).toBe('Hidden');
  });
});
