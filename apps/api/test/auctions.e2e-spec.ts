import { randomUUID } from 'node:crypto';
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
} from '../src/database/mongo/migrations/0008-auctions.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { AuctionClock } from '../src/modules/auctions/auction-clock.js';
import { AuctionWorker } from '../src/modules/auctions/auction-worker.service.js';
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
type Actor = { id: string; token: string };
const HOUR = 3_600_000;

describe('Auctions HTTP and MongoDB (FR-AU01–10)', () => {
  let app: INestApplication, db: MongoFixtures, fixtures: ListingFixtures;
  const users: string[] = [];
  let staff: Actor, otherStaff: Actor, reviewer: Actor, admin: Actor;

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
    return { id: user._id, token };
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

  beforeAll(async () => {
    db = await MongoFixtures.connect();
    fixtures = new ListingFixtures(db);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    await app.listen(0, '127.0.0.1');
    staff = await actor(['STAFF']);
    otherStaff = await actor(['STAFF', 'MEMBER']);
    reviewer = await actor(['STAFF']);
    admin = await actor(['ADMIN']);
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
    expect(won.body).toMatchObject({ won: true, finalPrice: 400_000 });
    vi.restoreAllMocks();
    pinClock(new Date(doc.endAt.getTime() + 24 * HOUR));
    await worker.tick();
    expect(await db.c.auctions.findOne({ _id: auctionId })).toMatchObject({
      state: 'PaymentExpired',
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
