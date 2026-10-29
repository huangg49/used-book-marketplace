import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { ReviewQueries } from '../src/modules/reviews/review-queries.service.js';
import type { ExchangeDoc, RoleCode } from '../src/database/mongo/documents.js';
import {
  REVIEW_EDIT_MS,
  REVIEW_SUBMISSION_MS,
} from '../src/modules/reviews/review-policy.js';

type Reader = { id: string; token: string; sessionId: string };
describe('Transaction reviews lifecycle — real Mongo HTTP', () => {
  let app: INestApplication,
    db: MongoFixtures,
    a: Reader,
    b: Reader,
    staff: Reader,
    outsider: Reader;
  const get = (path: string, actor?: Reader) => {
    const r = request(app.getHttpServer()).get('/api/v1' + path);
    return actor ? r.set('Authorization', 'Bearer ' + actor.token) : r;
  };
  const post = (
    path: string,
    body: object,
    actor: Reader,
    key = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', 'Bearer ' + actor.token)
      .set('Idempotency-Key', key)
      .send(body);
  const input = {
    bookRating: 4,
    partnerRating: 5,
    comment: 'Một đánh giá thật từ QA.',
    tags: ['Đúng mô tả'],
  };
  async function user(roles: RoleCode[] = ['MEMBER']): Promise<Reader> {
    const u = await db.user({ roles }),
      sid = await db.session(u._id);
    return {
      id: u._id,
      sessionId: sid,
      token: await app.get(JwtService).signAsync({ sub: u._id, sid }),
    };
  }
  async function exchange(
    completedAt: Date | null = new Date(),
    status: ExchangeDoc['status'] = 'Completed',
  ) {
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
      completedAt,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    return id;
  }
  async function age(id: string) {
    const createdAt = new Date(Date.now() - REVIEW_EDIT_MS - 10000);
    await db.c.transaction_reviews.updateMany(
      { transactionId: id },
      {
        $set: {
          createdAt,
          editDeadline: new Date(+createdAt + REVIEW_EDIT_MS),
        },
      },
    );
  }
  beforeAll(async () => {
    db = await MongoFixtures.connect();
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    await app.listen(0, '127.0.0.1');
    staff = await user(['STAFF']);
    outsider = await user();
  }, 60000);
  beforeEach(async () => {
    a = await user();
    b = await user();
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('keeps the legacy Exchange alias on the same idempotent review lifecycle', async () => {
    const id = await exchange(),
      legacy = `/exchanges/${id}/reviews`,
      key = randomUUID();
    await request(app.getHttpServer())
      .post('/api/v1' + legacy)
      .set('Authorization', 'Bearer ' + a.token)
      .send(input)
      .expect(400);
    const first = (await post(legacy, input, a, key).expect(201)).body;
    const replay = await post(legacy, input, a, key).expect(201);
    expect(replay.body).toEqual(first);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    const alias = await post(
      `/transactions/Exchange/${id}/reviews`,
      input,
      a,
      key,
    ).expect(200);
    expect(alias.body).toEqual(first);
    expect(alias.headers['idempotency-replayed']).toBe('true');
    expect((await get(legacy, a).expect(200)).body.myReview.id).toBe(first.id);
  });
  it('never discloses on second submit; replays one intent; rejects foreign/unfinished/expired writes', async () => {
    const id = await exchange(),
      url = `/transactions/Exchange/${id}/reviews`,
      key = randomUUID();
    const first = (await post(url, input, a, key).expect(200)).body;
    expect(first.status).toBe('Pending');
    expect(first.publishedAt).toBeNull();
    const replay = await post(url, input, a, key).expect(200);
    expect(replay.body).toEqual(first);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await post(url, { ...input, partnerRating: 1 }, a, key).expect(409);
    await post(url, input, a).expect(409);
    await post(url, input, outsider).expect(404);
    await post(url, input, b).expect(200);
    expect((await get(url, a).expect(200)).body.partnerReview).toBeNull();
    const blind = (await get(`/members/${a.id}/reputation`).expect(200)).body;
    expect(blind.reviewCount).toBe(0);
    expect(blind.partnerRatingCount).toBe(0);
    expect(blind.bookRatingCount).toBe(0);
    expect(blind.partnerRating).toBeNull();
    expect(blind.bookRating).toBeNull();
    const pending = (
      await get('/operations/transaction-reviews?limit=50', staff).expect(200)
    ).body.items;
    expect(pending.some((r: any) => r.review.transactionId === id)).toBe(false);
    const incomplete = await exchange(null, 'Preparing');
    await post(`/transactions/Exchange/${incomplete}/reviews`, input, a).expect(
      409,
    );
    const expired = await exchange(
      new Date(Date.now() - REVIEW_SUBMISSION_MS - 1000),
    );
    await post(`/transactions/Exchange/${expired}/reviews`, input, a).expect(
      409,
    );
    await post(url, { ...input, bookRating: 5.5 }, b).expect(422);
  });
  it('edits/deletes within the original deadline, retains revisions/tombstone and serializes same-version edits', async () => {
    const id = await exchange(),
      url = `/transactions/Exchange/${id}/reviews`;
    const r = (await post(url, input, a).expect(200)).body;
    const responses = await Promise.all([
      post(
        `/transaction-reviews/${r.id}/edit`,
        { ...input, partnerRating: 3, expectedVersion: 1 },
        a,
      ),
      post(
        `/transaction-reviews/${r.id}/edit`,
        { ...input, partnerRating: 2, expectedVersion: 1 },
        a,
      ),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const edited = responses.find((r) => r.status === 200)!.body;
    expect(edited.editDeadline).toBe(r.editDeadline);
    await post(
      `/transaction-reviews/${r.id}/edit`,
      { ...input, expectedVersion: 2 },
      b,
    ).expect(404);
    const key = randomUUID(),
      body = { expectedVersion: 2 };
    await post(`/transaction-reviews/${r.id}/delete`, body, a, key).expect(200);
    await post(`/transaction-reviews/${r.id}/delete`, body, a, key).expect(200);
    await post(url, input, a).expect(409);
    expect(await db.c.review_revisions.countDocuments({ reviewId: r.id })).toBe(
      3,
    );
    expect((await get(url, a)).body.canReview).toBe(false);
    await post(url, input, b).expect(200);
    await age(id);
    const deleted = (await get(`/members/${b.id}/reputation`).expect(200)).body;
    expect(deleted.partnerRatingCount).toBe(0);
    expect(deleted.bookRatingCount).toBe(0);
    expect(deleted.partnerRating).toBeNull();
    expect(deleted.bookRating).toBeNull();
    await db.setStatus(a.id, 'RESTRICTED');
    await post(`/transaction-reviews/${r.id}/delete`, body, a, key).expect(403);
  });
  it('publishes only after both edit windows; moderates independently and counts only valid public scores', async () => {
    const id = await exchange(),
      url = `/transactions/Exchange/${id}/reviews`;
    const ra = (await post(url, input, a).expect(200)).body;
    await post(url, { ...input, partnerRating: 3 }, b).expect(200);
    await age(id);
    await Promise.all([
      app.get(ReviewQueries).publishDue(),
      app.get(ReviewQueries).publishDue(),
    ]);
    const partner = (await get(url, b).expect(200)).body.partnerReview;
    expect(partner.id).toBe(ra.id);
    const profile = (await get(`/members/${b.id}/reputation`).expect(200)).body;
    expect(profile.reviewCount).toBe(1);
    expect(profile.partnerRatingCount).toBe(1);
    expect(profile.bookRatingCount).toBe(1);
    expect(profile.partnerRating).toBe(5);
    expect(profile.completedTransactions).toBe(1);
    expect(profile.verifiedViolations).toBe(0);
    await post(
      `/transaction-reviews/${ra.id}/edit`,
      { ...input, expectedVersion: partner.version },
      a,
    ).expect(409);
    await post(
      `/transaction-reviews/${ra.id}/reply`,
      { expectedVersion: partner.version, text: '   ' },
      b,
    ).expect(422);
    await post(
      `/operations/transaction-reviews/${ra.id}/decision`,
      { expectedVersion: partner.version, decision: 'Hide', reason: '   ' },
      staff,
    ).expect(422);
    const reply = (
      await post(
        `/transaction-reviews/${ra.id}/reply`,
        { expectedVersion: partner.version, text: 'Cảm ơn bạn đã góp ý.' },
        b,
      ).expect(200)
    ).body;
    expect(
      (await get(`/members/${b.id}/reputation`)).body.items[0].reply,
    ).toBeNull();
    expect((await get(url, a)).body.myReview.reply).toBeNull();
    expect((await get(url, b)).body.partnerReview.reply.status).toBe('Pending');
    await post(
      `/transaction-reviews/${ra.id}/reply`,
      { expectedVersion: 2, text: 'Lặp' },
      b,
    ).expect(409);
    await post(
      `/operations/transaction-reviews/${ra.id}/decision`,
      {
        expectedVersion: 2,
        decision: 'ApproveReply',
        reason: 'Nội dung phù hợp',
      },
      outsider,
    ).expect(403);
    await db.addRole(a.id, 'STAFF');
    await post(
      `/operations/transaction-reviews/${ra.id}/decision`,
      {
        expectedVersion: 2,
        decision: 'ApproveReply',
        reason: 'Nội dung phù hợp',
      },
      a,
    ).expect(403);
    const approved = (
      await post(
        `/operations/transaction-reviews/${ra.id}/decision`,
        {
          expectedVersion: reply.version,
          decision: 'ApproveReply',
          reason: 'Nội dung phù hợp',
        },
        staff,
      ).expect(200)
    ).body;
    expect(
      (await get(`/members/${b.id}/reputation`)).body.items[0].reply.status,
    ).toBe('Approved');
    const hideBody = {
        expectedVersion: approved.version,
        decision: 'Hide',
        reason: 'Nội dung vi phạm cần ẩn',
      },
      key = randomUUID();
    await post(
      `/operations/transaction-reviews/${ra.id}/decision`,
      hideBody,
      staff,
      key,
    ).expect(200);
    await post(
      `/operations/transaction-reviews/${ra.id}/decision`,
      hideBody,
      staff,
      key,
    ).expect(200);
    const hidden = (await get(`/members/${b.id}/reputation`)).body;
    expect(hidden.reviewCount).toBe(0);
    expect(hidden.partnerRatingCount).toBe(0);
    expect(hidden.bookRatingCount).toBe(0);
    expect(hidden.partnerRating).toBeNull();
    expect(hidden.bookRating).toBeNull();
    const operations = (
      await get('/operations/transaction-reviews?limit=50', staff)
    ).body.items.find((r: any) => r.review.id === ra.id);
    expect(operations.revisions.length).toBe(5);
    await db.c.auth_sessions.updateOne(
      { _id: staff.sessionId },
      { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
    await post(
      `/operations/transaction-reviews/${ra.id}/decision`,
      hideBody,
      staff,
      key,
    ).expect(401);
  });
  it('evidence-held and legacy-disclosed rows cannot be edited or deleted', async () => {
    const id = await exchange(),
      r = (
        await post(`/transactions/Exchange/${id}/reviews`, input, a).expect(200)
      ).body;
    await db.c.transaction_reviews.updateOne(
      { _id: r.id },
      { $set: { evidenceHeld: true } },
    );
    await post(
      `/transaction-reviews/${r.id}/delete`,
      { expectedVersion: 1 },
      a,
    ).expect(409);
    await db.c.transaction_reviews.updateOne(
      { _id: r.id },
      { $set: { evidenceHeld: false, legacyDisclosed: true } },
    );
    await post(
      `/transaction-reviews/${r.id}/edit`,
      { ...input, expectedVersion: 1 },
      a,
    ).expect(409);
  });
  it('gives a last-day review its full edit window and withholds single-sided public content', async () => {
    const id = await exchange(
        new Date(Date.now() - REVIEW_SUBMISSION_MS + 60000),
      ),
      url = `/transactions/Exchange/${id}/reviews`;
    const r = (await post(url, input, a).expect(200)).body;
    expect(Date.parse(r.editDeadline) - Date.parse(r.createdAt)).toBe(
      REVIEW_EDIT_MS,
    );
    // QA moves completion past the submission deadline without expiring the
    // first submission's edit right. No production time/worker is changed.
    await db.c.exchanges.updateOne(
      { _id: id },
      {
        $set: {
          completedAt: new Date(Date.now() - REVIEW_SUBMISSION_MS - 1000),
        },
      },
    );
    expect((await get(url, a).expect(200)).body.canEdit).toBe(true);
    expect((await get(url, b).expect(200)).body.partnerReview).toBeNull();
    expect(
      (await get(`/members/${b.id}/reputation`).expect(200)).body.reviewCount,
    ).toBe(0);
    await post(
      `/transaction-reviews/${r.id}/edit`,
      { ...input, expectedVersion: r.version, partnerRating: 3 },
      a,
    ).expect(200);
    await age(id);
    expect(
      (await get(url, b).expect(200)).body.partnerReview.partnerRating,
    ).toBe(3);
  });
  it('bounds revision pages and rejects prepublication, participant and cross-review cursors', async () => {
    const moderator = await user(['STAFF']),
      otherModerator = await user(['ADMIN']);
    const id = await exchange(),
      url = `/transactions/Exchange/${id}/reviews`;
    let r = (await post(url, input, a).expect(200)).body;
    const history = `/operations/transaction-reviews/${r.id}/revisions`;
    await get(history, moderator).expect(404);
    for (let i = 0; i < 21; i++)
      r = (
        await post(
          `/transaction-reviews/${r.id}/edit`,
          { ...input, expectedVersion: r.version, comment: `Revision ${i}` },
          a,
        ).expect(200)
      ).body;
    await post(url, input, b).expect(200);
    await age(id);
    await get(history, outsider).expect(403);
    await db.addRole(a.id, 'STAFF');
    await get(history, a).expect(404);
    const queue = (
      await get('/operations/transaction-reviews?limit=50', moderator).expect(
        200,
      )
    ).body.items.find((i: any) => i.review.id === r.id);
    expect(queue.revisions.length).toBe(20);
    expect(queue.nextRevisionCursor).toBeTruthy();
    const rest = (
      await get(
        `${history}?limit=20&cursor=${encodeURIComponent(queue.nextRevisionCursor)}`,
        moderator,
      ).expect(200)
    ).body;
    expect(rest.items.map((i: any) => i.version)).toEqual([2, 1]);
    expect(rest.nextCursor).toBeNull();
    const page = (await get(`${history}?limit=1`, moderator).expect(200)).body;
    expect(page.items[0].version).toBe(22);
    const next = (
      await get(
        `${history}?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`,
        moderator,
      ).expect(200)
    ).body;
    expect(next.items[0].version).toBe(21);
    await get(
      `${history}?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`,
      otherModerator,
    ).expect(400);
    const peer = (await get(url, b).expect(200)).body.myReview;
    await get(
      `/operations/transaction-reviews/${peer.id}/revisions?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`,
      moderator,
    ).expect(400);
  });
  it('pages completed obligations per lane with actor-scoped cursors', async () => {
    await exchange();
    await exchange();
    await exchange(null, 'Preparing');
    const p = (
      await get('/me/review-transactions?limit=1&type=Exchange', a).expect(200)
    ).body;
    expect(p.items.length).toBe(1);
    expect(p.nextCursor).toBeTruthy();
    const next = (
      await get(
        `/me/review-transactions?limit=1&type=Exchange&cursor=${encodeURIComponent(p.nextCursor)}`,
        a,
      ).expect(200)
    ).body;
    expect(next.items[0].transactionId).not.toBe(p.items[0].transactionId);
    await get(
      `/me/review-transactions?limit=1&type=Exchange&cursor=${encodeURIComponent(p.nextCursor)}`,
      outsider,
    ).expect(400);
    expect(
      (await get('/me/review-transactions?type=DirectOrder', a).expect(200))
        .body.items,
    ).toEqual([]);
  });
  it('supports completed Direct/Point Orders and never makes a seller rate books', async () => {
    const complete = new Date(Date.now() - 3_600_000),
      delivered = new Date(+complete - 72 * 3_600_000),
      created = new Date(+delivered - 3_600_000),
      paid = new Date(+created + 1000);
    const direct = randomUUID();
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
      sellerConfirmationDeadline: new Date(+paid + 48 * 3_600_000),
      cancellationRequestedAt: null,
      cancellationReason: null,
      deliveredAt: delivered,
      inspectionDeadline: complete,
      completedAt: complete,
      lockSeq: 0,
    });
    const point = randomUUID();
    await db.c.point_orders.insertOne({
      _id: point,
      source: 'Auction',
      auctionId: randomUUID(),
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
      paymentDeadline: new Date(+created + 24 * 3_600_000),
      paidAt: paid,
      closedAt: complete,
      updatedAt: complete,
      acceptanceDeadline: new Date(+paid + 72 * 3_600_000),
      acceptedAt: new Date(+paid + 1000),
      collectionDeadline: new Date(+paid + 72 * 3_600_000 + 2000),
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
      const url = `/transactions/${type}/${id}/reviews`;
      expect((await get(url, b).expect(200)).body.bookRatingRequired).toBe(
        false,
      );
      await post(url, input, b).expect(422);
      const seller = (
        await post(
          url,
          { partnerRating: 4, comment: 'Đối tác nhận sách đúng hẹn.' },
          b,
        ).expect(200)
      ).body;
      expect(seller.bookRating).toBeNull();
      await post(url, { partnerRating: 5 }, a).expect(422);
      await post(url, input, a).expect(200);
      await age(id);
      expect(
        (await get(`/me/review-transactions?type=${type}`, a).expect(200)).body
          .items[0].transactionId,
      ).toBe(id);
    }
    const profile = (await get(`/members/${a.id}/reputation`).expect(200)).body;
    expect(profile.completedTransactions).toBe(2);
    expect(profile.reviewCount).toBe(2);
    expect(profile.partnerRatingCount).toBe(2);
    expect(profile.bookRatingCount).toBe(0);
    expect(profile.bookRating).toBeNull();
    // Seller-to-buyer reviews have no book score. One Exchange review adds a
    // third partner score but only the first book score, even on a 1-item page.
    const ex = await exchange(),
      url = `/transactions/Exchange/${ex}/reviews`;
    await post(url, input, a).expect(200);
    const bookReview = (
      await post(url, { ...input, bookRating: 2, partnerRating: 2 }, b).expect(
        200,
      )
    ).body;
    await age(ex);
    const mixed = (await get(`/members/${a.id}/reputation?limit=1`).expect(200))
      .body;
    expect(mixed.items).toHaveLength(1);
    expect(mixed.reviewCount).toBe(3);
    expect(mixed.partnerRatingCount).toBe(3);
    expect(mixed.bookRatingCount).toBe(1);
    expect(mixed.partnerRating).toBeCloseTo(10 / 3);
    expect(mixed.bookRating).toBe(2);
    const supplied = (await get(`/members/${b.id}/reputation`).expect(200))
      .body;
    expect(supplied.bookRatingCount).toBe(3);
    expect(supplied.bookRating).toBe(4);
    const moderator = await user(['STAFF']);
    const hidden = (
      await post(
        `/operations/transaction-reviews/${bookReview.id}/decision`,
        {
          expectedVersion: bookReview.version,
          decision: 'Hide',
          reason: 'QA kiểm tra tập mẫu điểm sách',
        },
        moderator,
      ).expect(200)
    ).body;
    const withoutBook = (await get(`/members/${a.id}/reputation`).expect(200))
      .body;
    expect(withoutBook.partnerRatingCount).toBe(2);
    expect(withoutBook.partnerRating).toBe(4);
    expect(withoutBook.bookRatingCount).toBe(0);
    expect(withoutBook.bookRating).toBeNull();
    await post(
      `/operations/transaction-reviews/${bookReview.id}/decision`,
      {
        expectedVersion: hidden.version,
        decision: 'Restore',
        reason: 'QA khôi phục tập mẫu',
      },
      moderator,
    ).expect(200);
    const restored = (await get(`/members/${a.id}/reputation`).expect(200))
      .body;
    expect(restored.partnerRatingCount).toBe(3);
    expect(restored.bookRatingCount).toBe(1);
    expect(restored.bookRating).toBe(2);
  });
});
