import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode } from '../src/database/mongo/documents.js';
import {
  HANDOVER_POINT_A,
  HANDOVER_POINT_B,
  PLATFORM_COMMISSION_ACCOUNT_ID,
} from '../src/database/mongo/migrations/auction-constants.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { AuctionClock } from '../src/modules/auctions/auction-clock.js';
import { AuctionWorker } from '../src/modules/auctions/auction-worker.service.js';
import { isPointOpen } from '../src/modules/auctions/point-hours.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';
import { validates } from './helpers/contract.js';
import {
  CHECKLIST,
  listingContent,
  ListingFixtures,
} from './helpers/media-listings.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// Auctions over real HTTP, authorization and MongoDB (QA replica set, *_test
// database). Storage signing is faked; no auction path reads media.
const storage = {
  async check() {},
  async signedRead(key: string) {
    return {
      url: 'https://storage.test/' + key,
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
  },
};
type Actor = { id: string; token: string; sessionId: string };
const HOUR = 3_600_000;

describe('Auctions HTTP and MongoDB (FR-AU01–10)', () => {
  let app: INestApplication, db: MongoFixtures, fixtures: ListingFixtures;
  const users: string[] = [];
  let staff: Actor, otherStaff: Actor, reviewer: Actor, admin: Actor;
  let operator: Actor;
  const originalSecret = process.env.PAYMENT_SIMULATOR_SECRET;

  const call = (
    method: 'get' | 'post' | 'put',
    path: string,
    actor?: Actor,
  ) => {
    const r = request(app.getHttpServer())[method]('/api/v1' + path);
    return actor ? r.set('Authorization', `Bearer ${actor.token}`) : r;
  };
  const cmd = (
    method: 'post' | 'put',
    path: string,
    body: object,
    actor: Actor,
    key: string = randomUUID(),
  ) => call(method, path, actor).set('Idempotency-Key', key).send(body);
  async function actor(roles: RoleCode[] = ['MEMBER']): Promise<Actor> {
    const user = await db.user({ roles });
    users.push(user._id);
    const sessionId = await db.session(user._id);
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user._id, sid: sessionId });
    return { id: user._id, token, sessionId };
  }
  async function saleListing(owner: Actor, mode: 'Sale' | 'Both' = 'Sale') {
    const book = await fixtures.book(owner.id, reviewer.id);
    const l = await fixtures.listing(owner.id, book.id, true);
    await fixtures.commit(
      (tx) =>
        tx.c.listing_revisions.updateOne(
          { _id: l.revision },
          {
            $set:
              mode === 'Sale'
                ? { mode: 'Sale', exchangeValue: null }
                : { mode: listingContent.mode },
          },
        ),
      { listing: l.id },
    );
    await cmd(
      'post',
      `/operations/listings/${l.id}/decision`,
      {
        expectedVersion: 2,
        revisionId: l.revision,
        decision: 'Approve',
        checklist: CHECKLIST,
      },
      reviewer,
    ).expect(200);
    const listing = (await db.c.listings.findOne({ _id: l.id }))!;
    return { id: l.id, version: listing.version };
  }
  const intakeBody = (
    l: { id: string; version: number },
    over: Partial<{
      startPrice: number;
      step: number;
      buyNowPrice: number | null;
      pointId: string;
    }> = {},
  ) => ({
    listingId: l.id,
    expectedListingVersion: l.version,
    pointId: HANDOVER_POINT_A,
    startPrice: 200_000,
    step: 50_000,
    buyNowPrice: 600_000,
    ...over,
  });
  // Seller intake -> assigned Staff receive -> inspect Pass -> open.
  async function openAuction(over: Parameters<typeof intakeBody>[1] = {}) {
    const seller = await actor();
    const l = await saleListing(seller);
    const created = await cmd(
      'post',
      '/auction-intakes',
      intakeBody(l, over),
      seller,
    ).expect(200);
    const intakeId = created.body.intakeId as string;
    await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/receive`,
      { expectedVersion: 1, shelfCode: 'A-01' },
      staff,
    ).expect(200);
    await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/inspect`,
      { expectedVersion: 2, outcome: 'Pass', note: null },
      staff,
    ).expect(200);
    const opened = await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/open`,
      { expectedVersion: 3 },
      staff,
    ).expect(200);
    validates('AuctionCommandReceipt', opened.body);
    return {
      seller,
      listing: l,
      intakeId,
      auctionId: opened.body.auctionId as string,
    };
  }
  const bid = (auctionId: string, a: Actor, amount: number, key?: string) =>
    cmd(
      'post',
      `/auctions/${auctionId}/bids`,
      { amount, fulfillmentMethod: 'SelfCollect' },
      a,
      key,
    );
  const auto = (auctionId: string, a: Actor, maxAmount: number) =>
    cmd(
      'put',
      `/auctions/${auctionId}/auto-bid`,
      { maxAmount, fulfillmentMethod: 'SelfCollect' },
      a,
    );
  const pinClock = (at: Date) =>
    vi.spyOn(app.get(AuctionClock), 'now').mockResolvedValue(at);

  // Simulated topup through the independent TEST_OPERATOR event route.
  async function fund(a: Actor, amount: number) {
    const intent = (await cmd('post', '/me/topups', { amount }, a).expect(200))
      .body;
    await cmd(
      'post',
      '/operations/simulator/topup-events',
      {
        eventId: randomUUID(),
        intentId: intent.entityId,
        recipientId: a.id,
        amount,
        currency: 'VND',
        outcome: 'Succeeded',
        occurredAt: new Date().toISOString(),
      },
      operator,
    ).expect(200);
  }
  // Test-only: a session long enough for a clock pinned past the auction end.
  const longSession = (a: Actor) =>
    db.c.auth_sessions.updateOne(
      { _id: a.sessionId },
      { $set: { expiresAt: new Date(Date.now() + 10 * 24 * HOUR) } },
    );
  const payOrder = (orderId: string, a: Actor, key?: string) =>
    cmd('post', `/point-orders/${orderId}/pay`, { expectedVersion: 1 }, a, key);
  // Opens an auction, lets `winner` lead with one bid and closes it.
  async function wonAuction(winner: Actor, amount = 300_000) {
    const opened = await openAuction();
    await bid(opened.auctionId, winner, amount).expect(200);
    const doc = (await db.c.auctions.findOne({ _id: opened.auctionId }))!;
    pinClock(doc.endAt);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    const closed = (await db.c.auctions.findOne({ _id: opened.auctionId }))!;
    // Later commands share the closed auction's (pinned) timeline.
    await longSession(winner);
    const payAt = new Date(closed.closedAt!.getTime() + 60_000);
    return { ...opened, doc: closed, orderId: closed.orderId!, payAt };
  }

  // First instant at or after `from` + 1 minute when the point is open.
  const openAt = (from: Date) => {
    let t = new Date(from.getTime() + 60_000);
    while (!isPointOpen(t)) t = new Date(t.getTime() + 15 * 60_000);
    return t;
  };
  // A won, paid ViaPoint Order on a pinned timeline (clock restored after).
  async function paidOrder() {
    const winner = await actor();
    const won = await wonAuction(winner, 300_000);
    await fund(winner, 300_000);
    pinClock(won.payAt);
    await payOrder(won.orderId, winner).expect(200);
    vi.restoreAllMocks();
    await longSession(staff);
    await longSession(won.seller);
    return { ...won, winner };
  }
  const orderPost = (
    orderId: string,
    step: string,
    body: object,
    a: Actor,
    key?: string,
  ) => cmd('post', `/point-orders/${orderId}/${step}`, body, a, key);
  const handover = (
    orderId: string,
    code: string,
    s: Actor,
    version = 3,
    key?: string,
  ) =>
    cmd(
      'post',
      `/operations/point-orders/${orderId}/handover`,
      { expectedVersion: version, code },
      s,
      key,
    );
  // Accepts the report at `at` and returns the collection deadline.
  async function accepted(o: Awaited<ReturnType<typeof paidOrder>>, at: Date) {
    pinClock(at);
    await orderPost(
      o.orderId,
      'accept-report',
      { expectedVersion: 2 },
      o.winner,
    ).expect(200);
    vi.restoreAllMocks();
    return (await db.c.point_orders.findOne({ _id: o.orderId }))!;
  }
  async function issueCode(
    o: Awaited<ReturnType<typeof paidOrder>>,
    at: Date,
    key?: string,
  ) {
    pinClock(at);
    const r = await orderPost(
      o.orderId,
      'collection-code',
      { expectedVersion: 3 },
      o.winner,
      key,
    ).expect(200);
    vi.restoreAllMocks();
    return r;
  }

  // A paid Order handed over at the point on a pinned timeline (Inspection).
  async function collectedOrder(handler: Actor = staff) {
    const o = await paidOrder();
    await longSession(handler);
    const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    const acceptAt = new Date(paid.paidAt!.getTime() + 60_000);
    await accepted(o, acceptAt);
    const at = openAt(acceptAt);
    const issued = await issueCode(o, new Date(at.getTime() - 60_000));
    pinClock(at);
    await handover(o.orderId, issued.body.code, handler).expect(200);
    vi.restoreAllMocks();
    const collected = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    return { ...o, collected };
  }
  const resolveAs = (
    a: Actor,
    orderId: string,
    expectedVersion: number,
    decision: string,
    key?: string,
  ) =>
    cmd(
      'post',
      `/operations/point-orders/${orderId}/resolve`,
      {
        expectedVersion,
        decision,
        reason: 'Đã đối chiếu ảnh và biên bản tại điểm',
      },
      a,
      key,
    );
  const claimText =
    'Sách bị ố vàng và thiếu trang 120–128 so với biên bản kiểm tra tại điểm';
  const reconciled = async () =>
    (
      await app
        .get(MongoService)
        .tx((tx) => app.get(LedgerService).reconcile(tx))
    ).balanced;

  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    db = await MongoFixtures.connect();
    fixtures = new ListingFixtures(db);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    app
      .get(ConfigService)
      .set('PAYMENT_SIMULATOR_SECRET', process.env.PAYMENT_SIMULATOR_SECRET);
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    await app.listen(0, '127.0.0.1');
    staff = await actor(['STAFF']);
    otherStaff = await actor(['STAFF', 'MEMBER']);
    reviewer = await actor(['STAFF']);
    admin = await actor(['ADMIN']);
    operator = await actor(['TEST_OPERATOR']);
    const now = new Date();
    await db.c.point_staff_assignments.insertMany([
      {
        _id: randomUUID(),
        pointId: HANDOVER_POINT_A,
        userId: staff.id,
        validFrom: now,
        validTo: null,
        createdAt: now,
      },
      {
        _id: randomUUID(),
        pointId: HANDOVER_POINT_B,
        userId: otherStaff.id,
        validFrom: now,
        validTo: null,
        createdAt: now,
      },
    ]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    await db?.close();
    if (originalSecret === undefined)
      delete process.env.PAYMENT_SIMULATOR_SECRET;
    else process.env.PAYMENT_SIMULATOR_SECRET = originalSecret;
  });

  it('AC-AU01/02: only Approved Sale listings enter; intake holds commitment and slot', async () => {
    const seller = await actor();
    const both = await saleListing(seller, 'Both');
    await cmd('post', '/auction-intakes', intakeBody(both), seller).expect(409);
    const l = await saleListing(seller);
    const stranger = await actor();
    await cmd('post', '/auction-intakes', intakeBody(l), stranger).expect(404);
    await cmd(
      'post',
      '/auction-intakes',
      intakeBody(l, { buyNowPrice: 225_000 }),
      seller,
    ).expect(422);
    const key = randomUUID();
    const created = await cmd(
      'post',
      '/auction-intakes',
      intakeBody(l),
      seller,
      key,
    ).expect(200);
    const replay = await cmd(
      'post',
      '/auction-intakes',
      intakeBody(l),
      seller,
      key,
    ).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(created.body);
    expect(created.body).toMatchObject({
      entityType: 'AuctionIntake',
      state: 'AwaitingDropoff',
    });
    expect(await db.c.listings.findOne({ _id: l.id })).toMatchObject({
      trade: 'Reserved',
    });
    expect(
      await db.c.exclusive_commitments.countDocuments({
        listingId: l.id,
        status: 'Active',
      }),
    ).toBe(1);
    expect(
      await db.c.point_slots.countDocuments({ listingId: l.id, active: true }),
    ).toBe(1);
    await call('get', `/listings/${l.id}`).expect(404);
    const points = await call('get', '/handover-points', seller).expect(200);
    validates('HandoverPointList', points.body);

    const id = created.body.intakeId;
    // Not assigned at point A, ADMIN alone, or before receipt: no progress.
    await cmd(
      'post',
      `/operations/auction-intakes/${id}/receive`,
      { expectedVersion: 1, shelfCode: 'A-02' },
      otherStaff,
    ).expect(403);
    await cmd(
      'post',
      `/operations/auction-intakes/${id}/receive`,
      { expectedVersion: 1, shelfCode: 'A-02' },
      admin,
    ).expect(403);
    await cmd(
      'post',
      `/operations/auction-intakes/${id}/open`,
      { expectedVersion: 1 },
      staff,
    ).expect(409);
    // Cancel before drop-off releases everything atomically.
    await cmd(
      'post',
      `/auction-intakes/${id}/cancel`,
      { expectedVersion: 1 },
      seller,
    ).expect(200);
    expect(await db.c.listings.findOne({ _id: l.id })).toMatchObject({
      trade: 'Available',
    });
    expect(
      await db.c.exclusive_commitments.findOne({ listingId: l.id }),
    ).toMatchObject({ status: 'Released', reason: 'Cancelled' });
    expect(
      await db.c.point_slots.countDocuments({ listingId: l.id, active: true }),
    ).toBe(0);
  });

  it('AC-AU01: failed inspection never opens and goes to reclaim', async () => {
    const seller = await actor();
    const l = await saleListing(seller);
    const { body } = await cmd(
      'post',
      '/auction-intakes',
      intakeBody(l),
      seller,
    ).expect(200);
    await cmd(
      'post',
      `/operations/auction-intakes/${body.intakeId}/receive`,
      { expectedVersion: 1, shelfCode: 'A-03' },
      staff,
    ).expect(200);
    const failed = await cmd(
      'post',
      `/operations/auction-intakes/${body.intakeId}/inspect`,
      { expectedVersion: 2, outcome: 'Fail', note: 'Khác mô tả' },
      staff,
    ).expect(200);
    expect(failed.body.state).toBe('ReclaimRequired');
    await cmd(
      'post',
      `/operations/auction-intakes/${body.intakeId}/open`,
      { expectedVersion: 3 },
      staff,
    ).expect(409);
    await cmd(
      'post',
      `/operations/auction-intakes/${body.intakeId}/reclaim`,
      { expectedVersion: 3 },
      staff,
    ).expect(200);
    expect(await db.c.listings.findOne({ _id: l.id })).toMatchObject({
      trade: 'Available',
    });
    const mine = await call(
      'get',
      `/me/auction-intakes/${body.intakeId}`,
      seller,
    ).expect(200);
    validates('AuctionIntake', mine.body);
    expect(mine.body).toMatchObject({
      state: 'Reclaimed',
      reclaimReason: 'InspectionFailed',
      shelfCode: null,
    });
  });

  it('AC-AU03/04: Auto ceiling vs manual bids, price private to its owner', async () => {
    const { auctionId, seller } = await openAuction();
    const [a, b] = [await actor(), await actor()];
    const steps: [number, boolean][] = [];
    const first = await auto(auctionId, a, 400_000).expect(200);
    steps.push([first.body.currentPrice, first.body.leading]);
    let pub = await call('get', `/auctions/${auctionId}`).expect(200);
    validates('PublicAuction', pub.body);
    expect(JSON.stringify(pub.body)).not.toContain('400000');
    for (const amount of [250_000, 350_000, 450_000]) {
      const r = await bid(auctionId, b, amount).expect(200);
      steps.push([r.body.currentPrice, r.body.leading]);
    }
    expect(steps).toEqual([
      [200_000, true],
      [300_000, false],
      [400_000, false],
      [450_000, true],
    ]);
    pub = await call('get', `/auctions/${auctionId}`).expect(200);
    expect(pub.body.auction).toMatchObject({
      currentPrice: 450_000,
      minimumBid: 500_000,
      buyNowPrice: null,
      bidderCount: 2,
    });
    expect(pub.body.history.map((h: { price: number }) => h.price)).toEqual([
      450_000, 400_000, 300_000, 200_000,
    ]);
    const own = await call(
      'get',
      `/me/auctions/${auctionId}/participation`,
      a,
    ).expect(200);
    validates('AuctionParticipation', own.body);
    expect(own.body).toMatchObject({
      ownLevel: 400_000,
      mode: 'Auto',
      leading: false,
    });
    await call('get', `/me/auctions/${auctionId}/participation`, seller).expect(
      404,
    );
    // Seller-visible audit/outbox never carries a ceiling.
    const audits = await db.c.audit_events
      .find({ action: 'setAuctionAutoBid', actorId: a.id })
      .toArray();
    expect(JSON.stringify(audits)).not.toContain('400000');
  });

  it('AC-AU05/06: tie priority, leader rules, grid, BidTooLow and replay', async () => {
    const { auctionId } = await openAuction();
    const [a, b, c] = [await actor(), await actor(), await actor()];
    await auto(auctionId, a, 400_000).expect(200);
    const tie = await auto(auctionId, b, 400_000).expect(200);
    expect(tie.body).toMatchObject({ currentPrice: 400_000, leading: false });
    await bid(auctionId, a, 450_000).expect(409);
    const raised = await auto(auctionId, a, 600_000).expect(200);
    expect(raised.body).toMatchObject({ currentPrice: 400_000, leading: true });
    await auto(auctionId, a, 550_000).expect(409);
    await bid(auctionId, c, 425_000).expect(422);
    await bid(auctionId, c, 1_050_000).expect(422);
    const low = await bid(auctionId, c, 400_000).expect(409);
    expect(low.body.code).toBe('BidTooLow');
    const key = randomUUID();
    const first = await bid(auctionId, c, 700_000, key).expect(200);
    const again = await bid(auctionId, c, 700_000, key).expect(200);
    expect(again.headers['idempotency-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect((await bid(auctionId, c, 750_000, key).expect(409)).body.code).toBe(
      'IdempotencyConflict',
    );
    // Disabling a leading Auto keeps the obligation and does not lower price.
    await auto(auctionId, b, 800_000).expect(200);
    const off = await cmd(
      'post',
      `/auctions/${auctionId}/auto-bid/disable`,
      {},
      b,
    ).expect(200);
    expect(off.body).toMatchObject({ currentPrice: 750_000, leading: true });
    expect(
      await db.c.auction_bidders.findOne({ _id: `${auctionId}:${b.id}` }),
    ).toMatchObject({ mode: 'Manual', level: 750_000 });
  });

  it('AC-AU11: seller, Staff handling the book and LOCKED accounts cannot bid', async () => {
    const { auctionId, seller } = await openAuction();
    expect((await bid(auctionId, seller, 200_000).expect(403)).body.code).toBe(
      'SelfReviewForbidden',
    );
    const handling = await actor(['MEMBER', 'STAFF']);
    await db.c.point_staff_assignments.insertOne({
      _id: randomUUID(),
      pointId: HANDOVER_POINT_A,
      userId: handling.id,
      validFrom: new Date(),
      validTo: null,
      createdAt: new Date(),
    });
    await bid(auctionId, handling, 200_000).expect(403);
    const locked = await actor();
    await db.setStatus(locked.id, 'LOCKED');
    await bid(auctionId, locked, 200_000).expect(403);
    await call('get', `/auctions/${auctionId}`).expect(200);
    await cmd(
      'post',
      `/operations/auctions/${auctionId}/cancel`,
      { expectedVersion: 1, reason: 'Kiểm tra quyền hủy' },
      staff,
    ).expect(403);
  });

  it('AC-AU07: a racing first bid and Buy Now have exactly one winner', async () => {
    for (let round = 0; round < 3; round++) {
      const { auctionId } = await openAuction();
      const [x, y] = [await actor(), await actor()];
      const [r1, r2] = await Promise.all([
        bid(auctionId, x, 200_000),
        cmd(
          'post',
          `/auctions/${auctionId}/buy-now`,
          { fulfillmentMethod: 'SelfCollect' },
          y,
        ),
      ]);
      expect([r1.status, r2.status].filter((s) => s === 200)).toHaveLength(1);
      const a = (await db.c.auctions.findOne({ _id: auctionId }))!;
      if (r2.status === 200) {
        expect(a).toMatchObject({
          state: 'BuyNowPending',
          winnerId: y.id,
          finalPrice: 600_000,
          bidderCount: 0,
        });
        expect(a.paymentDeadline!.getTime() - a.closedAt!.getTime()).toBe(
          15 * 60_000,
        );
      } else
        expect(a).toMatchObject({
          state: 'Active',
          leaderId: x.id,
          bidderCount: 1,
        });
    }
  });

  it('simultaneous equal bids: one succeeds, the rest see BidTooLow', async () => {
    const { auctionId } = await openAuction();
    const bidders = await Promise.all(Array.from({ length: 6 }, () => actor()));
    const results = await Promise.all(
      bidders.map((b) => bid(auctionId, b, 300_000)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of results.filter((r) => r.status !== 200))
      expect(r.body.code).toBe('BidTooLow');
    expect(await db.c.auctions.findOne({ _id: auctionId })).toMatchObject({
      currentPrice: 300_000,
      bidderCount: 1,
      bidCount: 1,
    });
  });

  it('AC-AU08/09/13: endAt is enforced by server time; close and expiry are idempotent', async () => {
    const { auctionId, intakeId, listing } = await openAuction();
    const [a, b] = [await actor(), await actor()];
    await auto(auctionId, a, 400_000).expect(200);
    await bid(auctionId, b, 300_000).expect(200);
    const doc = (await db.c.auctions.findOne({ _id: auctionId }))!;
    pinClock(new Date(doc.endAt.getTime() - 1));
    await bid(auctionId, b, 400_000).expect(200);
    vi.restoreAllMocks();
    pinClock(doc.endAt);
    expect((await bid(auctionId, b, 500_000).expect(409)).body.code).toBe(
      'AuctionClosed',
    );
    const worker = app.get(AuctionWorker);
    const late = new Date(doc.endAt.getTime() + 5 * HOUR);
    vi.restoreAllMocks();
    pinClock(late);
    const [t1, t2] = await Promise.all([worker.tick(), worker.tick()]);
    expect(t1.failed + t2.failed).toBe(0);
    const closed = (await db.c.auctions.findOne({ _id: auctionId }))!;
    expect(closed).toMatchObject({
      state: 'AwaitingWinnerPayment',
      winnerId: a.id,
      finalPrice: 400_000,
    });
    expect(closed.paymentDeadline!.getTime()).toBe(
      doc.endAt.getTime() + 24 * HOUR,
    );
    expect(
      await db.c.mutation_receipts.countDocuments({
        operation: 'closeAuction',
        key: auctionId,
      }),
    ).toBe(1);
    const won = await call(
      'get',
      `/me/auctions/${auctionId}/participation`,
      a,
    ).expect(200);
    expect(won.body).toMatchObject({
      won: true,
      finalPrice: 400_000,
      orderId: closed.orderId,
    });
    const order = (await db.c.point_orders.findOne({ _id: closed.orderId! }))!;
    expect(order).toMatchObject({
      state: 'AwaitingPayment',
      buyerId: a.id,
      bookPrice: 400_000,
      buyerTotal: 400_000,
      commission: 20_000,
      sellerProceeds: 380_000,
    });
    // The commitment moved to the Order without a release (no gap).
    expect(
      await db.c.exclusive_commitments.findOne({ listingId: listing.id }),
    ).toMatchObject({ status: 'Active', currentContextId: order.contextId });
    vi.restoreAllMocks();
    pinClock(new Date(doc.endAt.getTime() + 24 * HOUR));
    await worker.tick();
    expect(await db.c.auctions.findOne({ _id: auctionId })).toMatchObject({
      state: 'PaymentExpired',
    });
    expect(await db.c.point_orders.findOne({ _id: order._id })).toMatchObject({
      state: 'PaymentExpired',
      paidAt: null,
    });
    expect(
      await db.c.wallet_accounts.countDocuments({ orderId: order._id }),
    ).toBe(0);
    const intakeDoc = (await db.c.auction_intakes.findOne({ _id: intakeId }))!;
    expect(
      await db.c.exclusive_commitments.findOne({ listingId: listing.id }),
    ).toMatchObject({
      status: 'Active',
      currentContextId: intakeDoc.contextId,
    });
    expect(await db.c.auction_intakes.findOne({ _id: intakeId })).toMatchObject(
      { state: 'ReclaimRequired', reclaimReason: 'PaymentExpired' },
    );
    // AC-AU14: the book stays off the shelf until the seller collects it.
    expect(await db.c.listings.findOne({ _id: listing.id })).toMatchObject({
      trade: 'Reserved',
    });
    vi.restoreAllMocks();
    await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/reclaim`,
      { expectedVersion: 5 },
      staff,
    ).expect(200);
    expect(await db.c.listings.findOne({ _id: listing.id })).toMatchObject({
      trade: 'Available',
    });
  });

  it('AC-AU09: the winner pays P from the wallet into an Order hold; the auction is Sold', async () => {
    const winner = await actor();
    const won = await wonAuction(winner, 300_000);
    expect(won.doc).toMatchObject({ state: 'AwaitingWinnerPayment' });
    pinClock(won.payAt);
    const stranger = await actor();
    await payOrder(won.orderId, stranger).expect(404);
    await call('get', `/me/point-orders/${won.orderId}`, stranger).expect(404);
    // Not enough available money: nothing is held or journalled.
    await fund(winner, 100_000);
    await payOrder(won.orderId, winner).expect(409);
    expect(
      await db.c.ledger_journals.countDocuments({ orderId: won.orderId }),
    ).toBe(0);
    await fund(winner, 400_000);
    const key = randomUUID();
    // Two payments racing with different keys: exactly one hold.
    const [p1, p2] = await Promise.all([
      payOrder(won.orderId, winner, key),
      payOrder(won.orderId, winner),
    ]);
    expect([p1.status, p2.status].filter((s) => s === 200)).toHaveLength(1);
    const ok = p1.status === 200 ? p1 : p2;
    validates('AuctionCommandReceipt', ok.body);
    expect(ok.body).toMatchObject({
      entityType: 'PointOrder',
      state: 'Fulfilling',
    });
    if (p1.status === 200) {
      const replay = await payOrder(won.orderId, winner, key).expect(200);
      expect(replay.headers['idempotency-replayed']).toBe('true');
    }
    expect(
      await db.c.ledger_journals.countDocuments({
        orderId: won.orderId,
        type: 'OrderPayment',
      }),
    ).toBe(1);
    expect(await db.c.auctions.findOne({ _id: won.auctionId })).toMatchObject({
      state: 'Sold',
    });
    const view = await call(
      'get',
      `/me/point-orders/${won.orderId}`,
      winner,
    ).expect(200);
    validates('PointOrder', view.body);
    expect(view.body).toMatchObject({
      role: 'Buyer',
      state: 'Fulfilling',
      amounts: { buyerTotal: 300_000, sellerProceedsOnCompletion: 285_000 },
    });
    const sellerView = await call(
      'get',
      `/me/point-orders/${won.orderId}`,
      won.seller,
    ).expect(200);
    expect(sellerView.body.role).toBe('Seller');
    expect(JSON.stringify(sellerView.body)).not.toContain(winner.id);
    const wallet = await call('get', '/me/wallet', winner).expect(200);
    expect(wallet.body).toMatchObject({ transactionHeld: 300_000 });
    // The worker never expires a paid Order.
    vi.restoreAllMocks();
    pinClock(new Date(won.doc.paymentDeadline!.getTime() + HOUR));
    const t = await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(t.failed).toBe(0);
    expect(await db.c.point_orders.findOne({ _id: won.orderId })).toMatchObject(
      { state: 'Fulfilling' },
    );
  });

  it('AC-AU09/13: payment at the deadline is refused and expiry wins', async () => {
    const winner = await actor();
    const won = await wonAuction(winner, 250_000);
    await fund(winner, 300_000);
    pinClock(won.doc.paymentDeadline!);
    await payOrder(won.orderId, winner).expect(409);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: won.orderId })).toMatchObject(
      { state: 'PaymentExpired' },
    );
    await payOrder(won.orderId, winner).expect(409);
    expect(
      await db.c.ledger_journals.countDocuments({ orderId: won.orderId }),
    ).toBe(0);
  });

  it('AC-AU06: Buy Now forms a 15-minute Order that can be paid', async () => {
    const { auctionId } = await openAuction();
    const buyer = await actor();
    const r = await cmd(
      'post',
      `/auctions/${auctionId}/buy-now`,
      { fulfillmentMethod: 'SelfCollect' },
      buyer,
    ).expect(200);
    expect(r.body.orderId).toEqual(expect.any(String));
    const order = (await db.c.point_orders.findOne({ _id: r.body.orderId }))!;
    expect(order.paymentDeadline.getTime() - order.createdAt.getTime()).toBe(
      15 * 60_000,
    );
    const own = await call(
      'get',
      `/me/auctions/${auctionId}/participation`,
      buyer,
    ).expect(200);
    expect(own.body).toMatchObject({
      boughtNow: true,
      won: true,
      orderId: order._id,
    });
    await fund(buyer, 600_000);
    await payOrder(order._id, buyer).expect(200);
    expect(await db.c.auctions.findOne({ _id: auctionId })).toMatchObject({
      state: 'Sold',
    });
  });

  it('FR-H09/H11/T03: report acceptance, one-time code and Staff handover open the inspection window', async () => {
    const o = await paidOrder();
    const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    expect(paid.acceptanceDeadline!.getTime() - paid.paidAt!.getTime()).toBe(
      72 * HOUR,
    );
    pinClock(new Date(paid.paidAt!.getTime() + 60_000));
    const view = await call(
      'get',
      `/me/point-orders/${o.orderId}`,
      o.winner,
    ).expect(200);
    validates('PointOrder', view.body);
    expect(view.body.report).toMatchObject({ outcome: 'Pass' });
    // No code before the report is accepted; nobody else can decide.
    await orderPost(
      o.orderId,
      'collection-code',
      { expectedVersion: 2 },
      o.winner,
    ).expect(409);
    await orderPost(
      o.orderId,
      'accept-report',
      { expectedVersion: 2 },
      o.seller,
    ).expect(404);
    vi.restoreAllMocks();
    const acceptAt = new Date(paid.paidAt!.getTime() + 2 * 60_000);
    const ready = await accepted(o, acceptAt);
    expect(ready.state).toBe('ReadyForCollection');
    // Within hours, or moved to a closing time (18:00 local).
    expect(isPointOpen(new Date(ready.collectionDeadline!.getTime() - 1))).toBe(
      true,
    );
    expect(ready.collectionDeadline!.getTime()).toBeGreaterThanOrEqual(
      acceptAt.getTime() + 72 * HOUR,
    );

    const at = openAt(acceptAt);
    const key = randomUUID();
    const issued = await issueCode(o, new Date(at.getTime() - 60_000), key);
    validates('CollectionCodeIssued', issued.body);
    const code = issued.body.code as string;
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(issued.body.receipt.codeExpiresAt).toEqual(expect.any(String));
    // The raw code is never stored: not in the code record, receipt or audit.
    const stored = JSON.stringify([
      await db.c.collection_codes.find({ orderId: o.orderId }).toArray(),
      await db.c.mutation_receipts.findOne({ _id: issued.body.receipt.id }),
      await db.c.audit_events.findOne({ receiptId: issued.body.receipt.id }),
    ]);
    expect(stored).not.toContain(`"${code}"`);
    const replay = await issueCode(o, new Date(at.getTime() - 60_000), key);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.code).toBeNull();

    // Staff of another point, the seller, and a closed point are refused.
    pinClock(at);
    await handover(o.orderId, code, otherStaff).expect(403);
    const wrongCode = code === '000000' ? '111111' : '000000';
    const wrong = await handover(o.orderId, wrongCode, staff).expect(200);
    expect(wrong.body).toMatchObject({
      collectionOutcome: 'WrongCode',
      attemptsRemaining: 4,
      state: 'ReadyForCollection',
    });
    const hkey = randomUUID();
    const done = await handover(o.orderId, code, staff, 3, hkey).expect(200);
    validates('AuctionCommandReceipt', done.body);
    expect(done.body).toMatchObject({
      collectionOutcome: 'HandedOver',
      state: 'Inspection',
      version: 4,
    });
    const again = await handover(o.orderId, code, staff, 3, hkey).expect(200);
    expect(again.headers['idempotency-replayed']).toBe('true');
    await handover(o.orderId, code, staff, 3).expect(409);
    vi.restoreAllMocks();
    const collected = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    expect(collected.collectedAt).toEqual(at);
    expect(collected.inspectionDeadline!.getTime()).toBe(
      at.getTime() + 72 * HOUR,
    );
    expect(
      await db.c.point_handovers.countDocuments({ orderId: o.orderId }),
    ).toBe(1);
    expect(
      await db.c.collection_codes.countDocuments({
        orderId: o.orderId,
        live: true,
      }),
    ).toBe(0);
    // The book stays reserved and the money held until settlement.
    expect(await db.c.listings.findOne({ _id: o.listing.id })).toMatchObject({
      trade: 'Reserved',
    });
  });

  it('AC-H17: closed point, wrong codes, sixth-attempt rate limit, expiry and a fresh code', async () => {
    const o = await paidOrder();
    const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    const acceptAt = new Date(paid.paidAt!.getTime() + 60_000);
    await accepted(o, acceptAt);
    const at = openAt(acceptAt);
    // A closed point never hands over, even with a live code.
    let closed = new Date(at.getTime());
    while (isPointOpen(closed))
      closed = new Date(closed.getTime() + 15 * 60_000);
    const early = await issueCode(o, new Date(closed.getTime() - 60_000));
    pinClock(closed);
    await handover(o.orderId, early.body.code, staff).expect(409);
    vi.restoreAllMocks();

    const first = await issueCode(o, new Date(at.getTime() - 60_000));
    const code = first.body.code as string;
    const wrongCode = code === '000000' ? '111111' : '000000';
    pinClock(at);
    for (const left of [4, 3, 2, 1, 0])
      expect(
        (await handover(o.orderId, wrongCode, staff).expect(200)).body,
      ).toMatchObject({
        collectionOutcome: 'WrongCode',
        attemptsRemaining: left,
      });
    const limited = await handover(o.orderId, code, staff).expect(200);
    expect(limited.body).toMatchObject({
      collectionOutcome: 'RateLimited',
      state: 'ReadyForCollection',
    });
    vi.restoreAllMocks();
    // After the 15-minute window the old code has also expired (10 minutes).
    const later = openAt(new Date(at.getTime() + 16 * 60_000));
    pinClock(later);
    expect(
      (await handover(o.orderId, code, staff).expect(200)).body
        .collectionOutcome,
    ).toBe('Expired');
    vi.restoreAllMocks();
    const fresh = await issueCode(o, later);
    pinClock(new Date(later.getTime() + 60_000));
    expect(
      (await handover(o.orderId, fresh.body.code, staff).expect(200)).body
        .collectionOutcome,
    ).toBe('HandedOver');
    vi.restoreAllMocks();
    expect(
      await db.c.collection_attempts.countDocuments({
        orderId: o.orderId,
        outcome: 'WrongCode',
      }),
    ).toBe(5);
  });

  it('FR-H09: rejection and missed deadlines open resolution without auto-accept or refund', async () => {
    const rejected = await paidOrder();
    const paid = (await db.c.point_orders.findOne({ _id: rejected.orderId }))!;
    pinClock(new Date(paid.paidAt!.getTime() + 60_000));
    const r = await orderPost(
      rejected.orderId,
      'reject-report',
      { expectedVersion: 2, reason: 'Sách khác mô tả ở phần gáy' },
      rejected.winner,
    ).expect(200);
    expect(r.body.state).toBe('ResolutionPending');
    vi.restoreAllMocks();

    const silent = await paidOrder();
    const silentPaid = (await db.c.point_orders.findOne({
      _id: silent.orderId,
    }))!;
    pinClock(silentPaid.acceptanceDeadline!);
    await orderPost(
      silent.orderId,
      'accept-report',
      { expectedVersion: 2 },
      silent.winner,
    ).expect(409);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();

    const noShow = await paidOrder();
    const noShowPaid = (await db.c.point_orders.findOne({
      _id: noShow.orderId,
    }))!;
    const ready = await accepted(
      noShow,
      new Date(noShowPaid.paidAt!.getTime() + 60_000),
    );
    await issueCode(
      noShow,
      new Date(noShowPaid.paidAt!.getTime() + 2 * 60_000),
    );
    pinClock(ready.collectionDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();

    for (const [o, reason] of [
      [rejected, 'ReportRejected'],
      [silent, 'RecipientDecisionOverdue'],
      [noShow, 'CollectionOverdue'],
    ] as const) {
      const doc = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
      expect(doc).toMatchObject({
        state: 'ResolutionPending',
        resolutionReason: reason,
        collectedAt: null,
      });
      // Money stays held, the book stays reserved, no live code survives.
      const hold = (await db.c.wallet_accounts.findOne({
        orderId: o.orderId,
      }))!;
      expect(
        await db.c.ledger_journals.countDocuments({
          orderId: o.orderId,
          type: 'OrderRefund',
        }),
      ).toBe(0);
      expect(hold).toBeTruthy();
      expect(
        await db.c.collection_codes.countDocuments({
          orderId: o.orderId,
          live: true,
        }),
      ).toBe(0);
      expect(await db.c.listings.findOne({ _id: o.listing.id })).toMatchObject({
        trade: 'Reserved',
      });
    }
    const wallet = await call('get', '/me/wallet', noShow.winner).expect(200);
    expect(wallet.body.transactionHeld).toBe(300_000);
  });

  it('FR-H09: an independent Admin refunds a no-show; the book returns to reclaim', async () => {
    const o = await paidOrder();
    await longSession(admin);
    const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    const ready = await accepted(o, new Date(paid.paidAt!.getTime() + 60_000));
    pinClock(ready.collectionDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    const pending = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    expect(pending).toMatchObject({
      state: 'ResolutionPending',
      resolutionReason: 'CollectionOverdue',
    });
    const decideAt = new Date(pending.resolutionOpenedAt!.getTime() + 60_000);
    pinClock(decideAt);
    const queue = await call(
      'get',
      '/operations/point-order-resolutions',
      admin,
    ).expect(200);
    validates('PointOrderResolutionQueue', queue.body);
    expect(queue.body.items.map((i: { id: string }) => i.id)).toContain(
      o.orderId,
    );
    const resolve = (
      a: Actor,
      decision: string,
      reason = 'Người mua không đến nhận đúng hạn',
      key?: string,
    ) =>
      cmd(
        'post',
        `/operations/point-orders/${o.orderId}/resolve`,
        { expectedVersion: pending.version, decision, reason },
        a,
        key,
      );
    await resolve(staff, 'RefundBuyer').expect(403);
    await resolve(admin, 'RefundBuyer', 'ngắn').expect(422);
    // An Admin who also works at this point is not independent.
    const pointAdmin = await actor(['ADMIN', 'STAFF']);
    await db.c.point_staff_assignments.insertOne({
      _id: randomUUID(),
      pointId: HANDOVER_POINT_A,
      userId: pointAdmin.id,
      validFrom: new Date(),
      validTo: null,
      createdAt: new Date(),
    });
    await longSession(pointAdmin);
    expect(
      (await resolve(pointAdmin, 'RefundBuyer').expect(403)).body.code,
    ).toBe('SelfReviewForbidden');
    const before = await call('get', '/me/wallet', o.winner).expect(200);
    const key = randomUUID();
    const done = await resolve(admin, 'RefundBuyer', undefined, key).expect(
      200,
    );
    expect(done.body).toMatchObject({
      entityType: 'PointOrder',
      state: 'Cancelled',
    });
    const replay = await resolve(admin, 'RefundBuyer', undefined, key).expect(
      200,
    );
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await resolve(admin, 'ResumeCollection').expect(409);
    vi.restoreAllMocks();
    const after = await call('get', '/me/wallet', o.winner).expect(200);
    expect(after.body.available - before.body.available).toBe(300_000);
    expect(after.body.transactionHeld).toBe(0);
    expect(
      await db.c.ledger_journals.countDocuments({
        orderId: o.orderId,
        type: 'OrderRefund',
      }),
    ).toBe(1);
    const decision = (await db.c.point_order_resolutions.findOne({
      orderId: o.orderId,
    }))!;
    expect(decision).toMatchObject({
      decision: 'RefundBuyer',
      openReason: 'CollectionOverdue',
      adminId: admin.id,
    });
    const intake = (await db.c.auction_intakes.findOne({ _id: o.intakeId }))!;
    expect(intake).toMatchObject({
      state: 'ReclaimRequired',
      reclaimReason: 'OrderCancelled',
    });
    expect(
      await db.c.exclusive_commitments.findOne({ listingId: o.listing.id }),
    ).toMatchObject({
      status: 'Active',
      currentContextId: intake.contextId,
    });
    const view = await call(
      'get',
      `/me/point-orders/${o.orderId}`,
      o.winner,
    ).expect(200);
    expect(view.body).toMatchObject({ state: 'Cancelled', refunded: true });
    pinClock(new Date(decideAt.getTime() + 60_000));
    await cmd(
      'post',
      `/operations/auction-intakes/${o.intakeId}/reclaim`,
      { expectedVersion: intake.version },
      staff,
    ).expect(200);
    vi.restoreAllMocks();
    expect(await db.c.listings.findOne({ _id: o.listing.id })).toMatchObject({
      trade: 'Available',
    });
    // Ledger, holds and every Order still reconcile after the refund.
    const report = await app
      .get(MongoService)
      .tx((tx) => app.get(LedgerService).reconcile(tx));
    expect(report.balanced).toBe(true);
  });

  it('FR-H09: Admin resumes collection after an unfounded rejection; racing decisions have one winner', async () => {
    const o = await paidOrder();
    await longSession(admin);
    const second = await actor(['ADMIN']);
    await longSession(second);
    const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    const rejectAt = new Date(paid.paidAt!.getTime() + 60_000);
    pinClock(rejectAt);
    await orderPost(
      o.orderId,
      'reject-report',
      { expectedVersion: 2, reason: 'Bìa có vết khác ảnh đăng' },
      o.winner,
    ).expect(200);
    vi.restoreAllMocks();
    const resumeAt = openAt(new Date(rejectAt.getTime() + 60_000));
    pinClock(resumeAt);
    const reason = 'Biên bản khớp ảnh đăng, mời nhận sách';
    const [r1, r2] = await Promise.all([
      cmd(
        'post',
        `/operations/point-orders/${o.orderId}/resolve`,
        { expectedVersion: 3, decision: 'ResumeCollection', reason },
        admin,
      ),
      cmd(
        'post',
        `/operations/point-orders/${o.orderId}/resolve`,
        { expectedVersion: 3, decision: 'RefundBuyer', reason },
        second,
      ),
    ]);
    expect([r1.status, r2.status].filter((x) => x === 200)).toHaveLength(1);
    vi.restoreAllMocks();
    const doc = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    expect(
      await db.c.point_order_resolutions.countDocuments({ orderId: o.orderId }),
    ).toBe(1);
    if (r2.status === 200) {
      expect(doc.state).toBe('Cancelled');
      return;
    }
    expect(doc).toMatchObject({
      state: 'ReadyForCollection',
      version: 4,
      resolutionReason: null,
    });
    expect(doc.collectionOpenedAt).toEqual(resumeAt);
    expect(
      await db.c.ledger_journals.countDocuments({
        orderId: o.orderId,
        type: 'OrderRefund',
      }),
    ).toBe(0);
    const at = openAt(resumeAt);
    pinClock(new Date(at.getTime() - 60_000));
    const issued = await orderPost(
      o.orderId,
      'collection-code',
      { expectedVersion: 4 },
      o.winner,
    ).expect(200);
    vi.restoreAllMocks();
    pinClock(at);
    const handed = await handover(o.orderId, issued.body.code, staff, 4).expect(
      200,
    );
    vi.restoreAllMocks();
    expect(handed.body).toMatchObject({
      collectionOutcome: 'HandedOver',
      state: 'Inspection',
    });
  });

  it('FR-H09: a second missed deadline on the same Order reopens resolution', async () => {
    const o = await paidOrder();
    await longSession(admin);
    const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    pinClock(paid.acceptanceDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    const resumeAt = openAt(paid.acceptanceDeadline!);
    pinClock(resumeAt);
    await resolveAs(admin, o.orderId, 3, 'ResumeCollection').expect(200);
    vi.restoreAllMocks();
    const ready = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    // An Admin decision opened this window; no buyer acceptance is invented.
    expect(ready).toMatchObject({
      state: 'ReadyForCollection',
      version: 4,
      acceptedAt: null,
      collectionOpenedAt: resumeAt,
    });
    // The worker step is keyed by Order version, so it is not a replay.
    pinClock(ready.collectionDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: o.orderId })).toMatchObject({
      state: 'ResolutionPending',
      resolutionReason: 'CollectionOverdue',
      version: 5,
    });
  });

  it('FR-T03/SRS 9.1: an unclaimed window settles once; seller gets P − C and the listing is Sold', async () => {
    const o = await collectedOrder();
    const deadline = o.collected.inspectionDeadline!;
    const sellerBefore = (await call('get', '/me/wallet', o.seller).expect(200))
      .body.available;
    pinClock(new Date(deadline.getTime() - 1));
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect((await db.c.point_orders.findOne({ _id: o.orderId }))!.state).toBe(
      'Inspection',
    );
    pinClock(deadline);
    await app.get(AuctionWorker).tick();
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: o.orderId })).toMatchObject({
      state: 'Completed',
      version: 5,
      closedAt: deadline,
    });
    // One three-way journal: hold −P, seller +(P − C), platform +C.
    const settlement = (await db.c.ledger_journals
      .find({ orderId: o.orderId, type: 'OrderSettlement' })
      .toArray())!;
    expect(settlement).toHaveLength(1);
    const entries = await db.c.ledger_entries
      .find({ journalId: settlement[0]._id })
      .toArray();
    expect(entries).toHaveLength(3);
    expect(
      entries.find((e) => e.accountId === PLATFORM_COMMISSION_ACCOUNT_ID),
    ).toMatchObject({ debit: 15_000, credit: 0 });
    const seller = await call('get', '/me/wallet', o.seller).expect(200);
    expect(seller.body.available - sellerBefore).toBe(285_000);
    const history = await call(
      'get',
      '/me/wallet/history?limit=5',
      o.seller,
    ).expect(200);
    validates('WalletHistoryPage', history.body);
    expect(history.body.items[0]).toMatchObject({
      type: 'OrderSettlement',
      orderId: o.orderId,
      amount: 285_000,
    });
    const buyer = await call('get', '/me/wallet', o.winner).expect(200);
    expect(buyer.body.transactionHeld).toBe(0);
    // The book stays with the buyer: slot, commitment and intake close Sold.
    expect(await db.c.listings.findOne({ _id: o.listing.id })).toMatchObject({
      trade: 'Sold',
    });
    const intake = (await db.c.auction_intakes.findOne({ _id: o.intakeId }))!;
    expect(intake).toMatchObject({ state: 'Sold', closedAt: deadline });
    expect(
      await db.c.point_slots.findOne({ _id: intake.slotId }),
    ).toMatchObject({ active: false, releaseReason: 'Sold' });
    expect(
      await db.c.exclusive_commitments.findOne({ listingId: o.listing.id }),
    ).toMatchObject({ status: 'Released', reason: 'Completed' });
    const view = await call(
      'get',
      `/me/point-orders/${o.orderId}`,
      o.winner,
    ).expect(200);
    validates('PointOrder', view.body);
    expect(view.body).toMatchObject({
      state: 'Completed',
      settled: true,
      refunded: false,
    });
    const sellerView = await call(
      'get',
      `/me/point-orders/${o.orderId}`,
      o.seller,
    ).expect(200);
    expect(sellerView.body).toMatchObject({ role: 'Seller', settled: true });
    const intakeView = await call(
      'get',
      `/me/auction-intakes/${o.intakeId}`,
      o.seller,
    ).expect(200);
    validates('AuctionIntake', intakeView.body);
    expect(intakeView.body.state).toBe('Sold');
    // No claim after settlement; the whole ledger still reconciles.
    await orderPost(
      o.orderId,
      'claim',
      { expectedVersion: 5, description: claimText },
      o.winner,
    ).expect(409);
    expect(await reconciled()).toBe(true);
  });

  it('FR-D01/02: a claim stops settlement; the Admin requires the book back and Staff refund on receipt', async () => {
    const o = await collectedOrder();
    await longSession(admin);
    const c = o.collected;
    pinClock(new Date(c.collectedAt!.getTime() + HOUR));
    const claim = (a: Actor, description: string, key?: string) =>
      orderPost(
        o.orderId,
        'claim',
        { expectedVersion: 4, description },
        a,
        key,
      );
    await claim(o.winner, 'quá ngắn').expect(422);
    await claim(o.seller, claimText).expect(404);
    const key = randomUUID();
    const claimed = await claim(o.winner, claimText, key).expect(200);
    validates('AuctionCommandReceipt', claimed.body);
    expect(claimed.body).toMatchObject({
      state: 'ResolutionPending',
      version: 5,
    });
    const replay = await claim(o.winner, claimText, key).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    vi.restoreAllMocks();
    // The window passes, but a claimed Order is never settled by the worker.
    pinClock(c.inspectionDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect((await db.c.point_orders.findOne({ _id: o.orderId }))!.state).toBe(
      'ResolutionPending',
    );
    expect(
      await db.c.ledger_journals.countDocuments({
        orderId: o.orderId,
        type: 'OrderSettlement',
      }),
    ).toBe(0);
    const decideAt = openAt(c.inspectionDeadline!);
    pinClock(decideAt);
    const queue = await call(
      'get',
      '/operations/point-order-resolutions',
      admin,
    ).expect(200);
    validates('PointOrderResolutionQueue', queue.body);
    expect(
      queue.body.items.find((i: { id: string }) => i.id === o.orderId),
    ).toMatchObject({ openReason: 'InspectionClaim' });
    // Decisions meant for a book still at the point do not apply here.
    await resolveAs(admin, o.orderId, 5, 'RefundBuyer').expect(422);
    await resolveAs(staff, o.orderId, 5, 'RequireReturn').expect(403);
    const required = await resolveAs(
      admin,
      o.orderId,
      5,
      'RequireReturn',
    ).expect(200);
    expect(required.body).toMatchObject({ state: 'ReturnPending', version: 6 });
    vi.restoreAllMocks();
    const pending = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    expect(pending.returnDeadline!.getTime()).toBeGreaterThanOrEqual(
      decideAt.getTime() + 72 * HOUR,
    );
    const returnAt = openAt(decideAt);
    pinClock(returnAt);
    const staffQueue = await call(
      'get',
      '/operations/point-orders',
      staff,
    ).expect(200);
    validates('PointCollectionQueue', staffQueue.body);
    expect(
      staffQueue.body.items.find((i: { id: string }) => i.id === o.orderId),
    ).toMatchObject({ state: 'ReturnPending' });
    const receive = (a: Actor, rkey?: string) =>
      cmd(
        'post',
        `/operations/point-orders/${o.orderId}/receive-return`,
        {
          expectedVersion: 6,
          note: 'Nhận lại đủ sách, tình trạng như lúc giao',
        },
        a,
        rkey,
      );
    await receive(otherStaff).expect(403);
    await receive(o.winner).expect(403);
    const before = (await call('get', '/me/wallet', o.winner).expect(200)).body;
    const rkey = randomUUID();
    const received = await receive(staff, rkey).expect(200);
    expect(received.body).toMatchObject({ state: 'Cancelled', version: 7 });
    const again = await receive(staff, rkey).expect(200);
    expect(again.headers['idempotency-replayed']).toBe('true');
    vi.restoreAllMocks();
    const after = (await call('get', '/me/wallet', o.winner).expect(200)).body;
    expect(after.available - before.available).toBe(300_000);
    expect(after.transactionHeld).toBe(0);
    expect(
      await db.c.point_returns.findOne({ orderId: o.orderId }),
    ).toMatchObject({ staffId: staff.id, returnedBy: o.winner.id });
    expect(
      await db.c.ledger_journals.countDocuments({
        orderId: o.orderId,
        type: 'OrderRefund',
      }),
    ).toBe(1);
    const intake = (await db.c.auction_intakes.findOne({ _id: o.intakeId }))!;
    expect(intake).toMatchObject({
      state: 'ReclaimRequired',
      reclaimReason: 'OrderReturned',
    });
    expect(
      await db.c.exclusive_commitments.findOne({ listingId: o.listing.id }),
    ).toMatchObject({ status: 'Active', currentContextId: intake.contextId });
    const view = await call(
      'get',
      `/me/point-orders/${o.orderId}`,
      o.winner,
    ).expect(200);
    validates('PointOrder', view.body);
    expect(view.body).toMatchObject({ state: 'Cancelled', refunded: true });
    expect(view.body.returnedAt).toEqual(returnAt.toISOString());
    expect(await reconciled()).toBe(true);
  });

  it('FR-D02: the Staff who handed the book over cannot decide its claim, even after leaving the point', async () => {
    const handler = await actor(['ADMIN', 'STAFF']);
    const assignmentId = randomUUID();
    await db.c.point_staff_assignments.insertOne({
      _id: assignmentId,
      pointId: HANDOVER_POINT_A,
      userId: handler.id,
      validFrom: new Date(),
      validTo: null,
      createdAt: new Date(),
    });
    const o = await collectedOrder(handler);
    expect(
      await db.c.point_handovers.findOne({ orderId: o.orderId }),
    ).toMatchObject({ staffId: handler.id });
    // The assignment ends before the pinned decision time below.
    await db.c.point_staff_assignments.updateOne(
      { _id: assignmentId },
      { $set: { validTo: new Date(Date.now() + 1000) } },
    );
    const c = o.collected;
    pinClock(new Date(c.collectedAt!.getTime() + 60_000));
    await orderPost(
      o.orderId,
      'claim',
      { expectedVersion: 4, description: claimText },
      o.winner,
    ).expect(200);
    vi.restoreAllMocks();
    pinClock(new Date(c.collectedAt!.getTime() + 2 * 60_000));
    const refused = await resolveAs(
      handler,
      o.orderId,
      5,
      'DismissClaim',
    ).expect(403);
    expect(refused.body.code).toBe('SelfReviewForbidden');
    const queue = await call(
      'get',
      '/operations/point-order-resolutions',
      handler,
    ).expect(200);
    expect(queue.body.items.map((i: { id: string }) => i.id)).not.toContain(
      o.orderId,
    );
    await longSession(admin);
    await resolveAs(admin, o.orderId, 5, 'DismissClaim').expect(200);
  });

  it('FR-D02: a dismissed claim settles after the window; one claim per Order; a missed return reopens resolution', async () => {
    const o = await collectedOrder();
    await longSession(admin);
    const c = o.collected;
    pinClock(new Date(c.collectedAt!.getTime() + 60_000));
    await orderPost(
      o.orderId,
      'claim',
      { expectedVersion: 4, description: claimText },
      o.winner,
    ).expect(200);
    vi.restoreAllMocks();
    pinClock(new Date(c.collectedAt!.getTime() + 2 * 60_000));
    await resolveAs(admin, o.orderId, 5, 'DismissClaim').expect(200);
    await orderPost(
      o.orderId,
      'claim',
      { expectedVersion: 6, description: claimText },
      o.winner,
    ).expect(409);
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: o.orderId })).toMatchObject({
      state: 'Inspection',
      version: 6,
      resolutionReason: null,
    });
    pinClock(c.inspectionDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: o.orderId })).toMatchObject({
      state: 'Completed',
      version: 7,
    });

    // The buyer never brings the book back: the return deadline reopens
    // resolution, and a dismissal then lets the settlement run.
    const p = await collectedOrder();
    const pc = p.collected;
    pinClock(new Date(pc.collectedAt!.getTime() + 60_000));
    await orderPost(
      p.orderId,
      'claim',
      { expectedVersion: 4, description: claimText },
      p.winner,
    ).expect(200);
    vi.restoreAllMocks();
    pinClock(new Date(pc.collectedAt!.getTime() + 2 * 60_000));
    await resolveAs(admin, p.orderId, 5, 'RequireReturn').expect(200);
    vi.restoreAllMocks();
    const pending = (await db.c.point_orders.findOne({ _id: p.orderId }))!;
    pinClock(pending.returnDeadline!);
    await cmd(
      'post',
      `/operations/point-orders/${p.orderId}/receive-return`,
      { expectedVersion: 6, note: null },
      staff,
    ).expect(409);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: p.orderId })).toMatchObject({
      state: 'ResolutionPending',
      resolutionReason: 'ReturnOverdue',
      version: 7,
    });
    const decideAt = openAt(pending.returnDeadline!);
    pinClock(decideAt);
    await resolveAs(admin, p.orderId, 7, 'DismissClaim').expect(200);
    vi.restoreAllMocks();
    pinClock(new Date(decideAt.getTime() + 60_000));
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: p.orderId })).toMatchObject({
      state: 'Completed',
      version: 9,
    });
    expect(
      await db.c.point_order_resolutions.countDocuments({ orderId: p.orderId }),
    ).toBe(2);
    expect(await reconciled()).toBe(true);
  });

  it('AC-AU08/10: no bids closes Unsold; Admin cancel needs independence and a reason', async () => {
    const first = await openAuction();
    const doc = (await db.c.auctions.findOne({ _id: first.auctionId }))!;
    pinClock(doc.endAt);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.auctions.findOne({ _id: first.auctionId })).toMatchObject(
      { state: 'Unsold' },
    );
    expect(
      await db.c.auction_intakes.findOne({ _id: first.intakeId }),
    ).toMatchObject({ state: 'ReclaimRequired', reclaimReason: 'Unsold' });

    const second = await openAuction();
    const bidder = await actor();
    await bid(second.auctionId, bidder, 200_000).expect(200);
    await cmd(
      'post',
      `/auction-intakes/${second.intakeId}/cancel`,
      { expectedVersion: 4 },
      second.seller,
    ).expect(409);
    await cmd(
      'post',
      `/operations/auctions/${second.auctionId}/cancel`,
      { expectedVersion: 2, reason: 'ngắn' },
      admin,
    ).expect(422);
    const cancelled = await cmd(
      'post',
      `/operations/auctions/${second.auctionId}/cancel`,
      { expectedVersion: 2, reason: 'Nghi ngờ gian lận trong phiên' },
      admin,
    ).expect(200);
    expect(cancelled.body.state).toBe('Cancelled');
    await bid(second.auctionId, await actor(), 250_000).expect(409);
  });
});
