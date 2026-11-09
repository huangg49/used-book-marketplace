import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
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
import { AuctionLiveService } from '../src/modules/auctions/auction-live.service.js';
import { stepKey } from '../src/modules/auctions/system-key.js';
import { isPointOpen } from '../src/modules/auctions/point-hours.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';
import { AuctionBiddingService } from '../src/modules/auctions/auction-bidding.service.js';
import { AuctionIntakesService } from '../src/modules/auctions/auction-intakes.service.js';
import { validates } from './helpers/contract.js';
import {
  CHECKLIST,
  listingContent,
  ListingFixtures,
} from './helpers/media-listings.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// Auctions over real HTTP, authorization and MongoDB (QA replica set, *_test
// database). Storage signing is faked; no live bucket is used.
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
  // ADR 0042: auctions use the seller's own Auction-channel listing.
  async function saleListing(
    owner: Actor,
    mode: 'Sale' | 'Both' | 'Exchange' = 'Sale',
    channel: 'Auction' | 'Marketplace' = 'Auction',
  ) {
    const book = await fixtures.book(owner.id, reviewer.id);
    const l = await fixtures.listing(owner.id, book.id, true, channel);
    await fixtures.commit(
      (tx) =>
        tx.c.listing_revisions.updateOne(
          { _id: l.revision },
          {
            $set:
              mode === 'Sale'
                ? { mode: 'Sale', exchangeValue: null }
                : mode === 'Exchange'
                  ? { mode: 'Exchange', salePrice: null, exchangeValue: listingContent.exchangeValue }
                  : { mode: 'Both', exchangeValue: listingContent.exchangeValue },
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
      declaredValue: number | null;
      buyNowMode: 'Challenge' | 'Instant';
      auctionType: 'English' | 'Dutch' | 'SealedFirst' | 'SealedSecond';
      dutchTopPrice: number | null;
      dutchIntervalSeconds: number | null;
      minBidders: number;
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
  // Seller intake -> assigned Staff receive -> inspect Pass (intake v3).
  async function passedIntake(over: Parameters<typeof intakeBody>[1] = {}) {
    const seller = await actor();
    const l = await saleListing(seller);
    const created = await cmd(
      'post',
      '/auction-intakes',
      intakeBody(l, over),
      seller,
    ).expect(200);
    const intakeId = created.body.intakeId as string;
    const pointStaff = over.pointId === HANDOVER_POINT_B ? otherStaff : staff;
    await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/receive`,
      { expectedVersion: 1, shelfCode: 'A-01' },
      pointStaff,
    ).expect(200);
    await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/inspect`,
      { expectedVersion: 2, outcome: 'Pass', note: null },
      pointStaff,
    ).expect(200);
    return { seller, listing: l, intakeId };
  }
  // ADR 0047: the seller publishes now (startAt null) or later.
  const publish = (
    intakeId: string,
    seller: Actor,
    body: Partial<{
      expectedVersion: number;
      startAt: string | null;
      durationSeconds: number;
    }> = {},
    key?: string,
  ) =>
    cmd(
      'post',
      `/auction-intakes/${intakeId}/publish`,
      { expectedVersion: 3, startAt: null, durationSeconds: 24 * 3600, ...body },
      seller,
      key,
    );
  const reschedule = (
    auctionId: string,
    seller: Actor,
    body: { expectedVersion: number; startAt: string | null; durationSeconds: number },
  ) => cmd('post', `/auctions/${auctionId}/schedule`, body, seller);
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
    const pointStaff = over.pointId === HANDOVER_POINT_B ? otherStaff : staff;
    await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/receive`,
      { expectedVersion: 1, shelfCode: 'A-01' },
      pointStaff,
    ).expect(200);
    await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/inspect`,
      { expectedVersion: 2, outcome: 'Pass', note: null },
      pointStaff,
    ).expect(200);
    const opened = await cmd(
      'post',
      `/operations/auction-intakes/${intakeId}/open`,
      { expectedVersion: 3 },
      pointStaff,
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
  // Runs the close worker at the auction's current endAt (clock restored after).
  async function closeAt(auctionId: string) {
    const doc = (await db.c.auctions.findOne({ _id: auctionId }))!;
    pinClock(doc.endAt);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    return (await db.c.auctions.findOne({ _id: auctionId }))!;
  }
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
    fault?: string,
  ) =>
    cmd(
      'post',
      `/operations/point-orders/${orderId}/resolve`,
      {
        expectedVersion,
        decision,
        reason: 'Đã đối chiếu ảnh và biên bản tại điểm',
        ...(fault ? { fault } : {}),
      },
      a,
      key,
    );
  const claimText =
    'Sách bị ố vàng và thiếu trang 120–128 so với biên bản kiểm tra tại điểm';
  it('LOCKED buyers retain paid point-order reads, report/code/claim duties and cannot pay again', async () => {
    const o = await paidOrder();
    await db.setStatus(o.winner.id, 'LOCKED');
    const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    const acceptAt = new Date(paid.paidAt!.getTime() + 60_000);
    await request(app.getHttpServer()).get(`/api/v1/me/point-orders/${o.orderId}`)
      .set('Authorization', `Bearer ${o.winner.token}`).expect(200);
    await payOrder(o.orderId, o.winner).expect(403);
    await accepted(o, acceptAt);
    const at = openAt(acceptAt);
    const issued = await issueCode(o, new Date(at.getTime() - 60_000));
    pinClock(at);
    await handover(o.orderId, issued.body.code, staff).expect(200);
    vi.restoreAllMocks();
    const row = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    pinClock(new Date(at.getTime() + 60_000));
    const claimKey = randomUUID();
    const claim = { expectedVersion: row.version, description: claimText };
    await orderPost(o.orderId, 'claim', claim, o.winner, claimKey).expect(200);
    await orderPost(o.orderId, 'claim', claim, o.winner, claimKey).expect(200);
    vi.restoreAllMocks();
    await db.c.auth_sessions.updateOne({ _id: o.winner.sessionId }, { $set: { revokedAt: new Date() } });
    await orderPost(o.orderId, 'claim', claim, o.winner, claimKey).expect(401);
  });
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
    // Test-only: the suite opens far more auctions than the 20-slot demo
    // points hold and no case depends on that capacity, so every *_test point
    // gets room for all of them (closing order would otherwise decide).
    await db.c.handover_points.updateMany({}, { $set: { capacity: 200 } });
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

  // First in the suite: the queue shows the 50 auctions ending soonest.
  it('Admin cancel queue lists open auctions with their version, never involved ones', async () => {
    const open = await openAuction();
    const mine = await openAuction();
    const adminBidder = await actor(['ADMIN', 'MEMBER']);
    await bid(mine.auctionId, adminBidder, 200_000).expect(200);
    await call('get', '/operations/auctions', staff).expect(403);
    await call('get', '/operations/auctions', await actor()).expect(403);
    await call('get', '/operations/auctions').expect(401);
    const list = await call('get', '/operations/auctions', adminBidder).expect(
      200,
    );
    validates('OperationsAuctionList', list.body);
    expect(list.headers['cache-control']).toBe('no-store');
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(open.auctionId);
    // The Admin bids in `mine`, so `cancel` would refuse: it is not offered.
    expect(ids).not.toContain(mine.auctionId);
    const row = list.body.items.find(
      (i: { id: string }) => i.id === open.auctionId,
    );
    const doc = (await db.c.auctions.findOne({ _id: open.auctionId }))!;
    expect(row).toMatchObject({ version: doc.version, state: 'Active' });
    expect(JSON.stringify(list.body)).not.toMatch(/maxAmount|leaderId|seller/);
    // The listed version is what cancel accepts.
    await cmd(
      'post',
      `/operations/auctions/${open.auctionId}/cancel`,
      {
        expectedVersion: row.version,
        reason: 'Kiểm tra hủy từ danh sách vận hành',
      },
      admin,
    ).expect(200);
    const after = await call('get', '/operations/auctions', admin).expect(200);
    expect(after.body.items.map((i: { id: string }) => i.id)).not.toContain(
      open.auctionId,
    );
  });

  it('Admin manages points and Staff assignments with version, audit and obligation rules (FR-H04)', async () => {
    const code = `HCM-T-${randomBytes(3).toString('hex').toUpperCase()}`;
    const create = {
      code,
      name: 'Điểm kiểm thử N4',
      displayAddress: 'Bàn kiểm thử — không phải địa điểm thực tế, TP.HCM',
      capacity: 2,
    };
    await call('get', '/operations/points', staff).expect(403);
    await call('get', '/operations/points').expect(401);
    await cmd('post', '/operations/points', create, staff).expect(403);
    const key = randomUUID();
    const created = await cmd('post', '/operations/points', create, admin, key);
    expect(created.status).toBe(200);
    validates('PointCommandReceipt', created.body);
    expect(created.body).toMatchObject({ state: 'Paused', version: 1 });
    const pointId = created.body.pointId as string;
    const replay = await cmd('post', '/operations/points', create, admin, key);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(created.body);
    await cmd('post', '/operations/points', create, admin).expect(422);
    const update = (version: number, over: object = {}) => ({
      expectedVersion: version,
      name: create.name,
      displayAddress: create.displayAddress,
      capacity: 2,
      status: 'Active',
      reason: 'Mở điểm kiểm thử sau khi phân công',
      ...over,
    });
    // Active needs a current Staff assignment.
    await cmd('post', `/operations/points/${pointId}`, update(1), admin).expect(
      409,
    );
    const pointStaff = await actor(['STAFF']);
    const member = await actor();
    const assign = (version: number, userId: string, a: Actor = admin) =>
      cmd(
        'post',
        `/operations/points/${pointId}/assignments`,
        { expectedVersion: version, userId },
        a,
      );
    await assign(1, admin.id).expect(403);
    await assign(1, member.id).expect(422);
    const assigned = await assign(1, pointStaff.id).expect(200);
    validates('PointCommandReceipt', assigned.body);
    expect(assigned.body).toMatchObject({
      entityType: 'PointAssignment',
      state: 'Current',
      version: 2,
    });
    await assign(1, pointStaff.id).expect(409); // stale version
    await assign(2, pointStaff.id).expect(409); // already current
    const mine = await call('get', '/me/point-assignments', pointStaff).expect(
      200,
    );
    validates('MyPointAssignmentList', mine.body);
    expect(mine.body.items).toEqual([
      expect.objectContaining({ pointId, code, status: 'Paused' }),
    ]);
    await call('get', '/me/point-assignments', member).expect(403);
    await cmd('post', `/operations/points/${pointId}`, update(2), admin).expect(
      200,
    );
    // Two held slots: capacity cannot drop below them, Closed and ending the
    // last assignment are refused while they are held.
    const intakes = [];
    for (let n = 0; n < 2; n++) {
      const seller = await actor();
      const l = await saleListing(seller);
      intakes.push(
        (
          await cmd(
            'post',
            '/auction-intakes',
            intakeBody(l, { pointId }),
            seller,
          ).expect(200)
        ).body.intakeId as string,
      );
    }
    const list = await call('get', '/operations/points', admin).expect(200);
    validates('OperationsPointList', list.body);
    const row = list.body.items.find((p: { id: string }) => p.id === pointId);
    expect(row).toMatchObject({ heldSlots: 2, version: 3, status: 'Active' });
    expect(row.assignments).toEqual([
      expect.objectContaining({ userId: pointStaff.id }),
    ]);
    await cmd(
      'post',
      `/operations/points/${pointId}`,
      update(3, { capacity: 1 }),
      admin,
    ).expect(422);
    await cmd(
      'post',
      `/operations/points/${pointId}`,
      update(3, { status: 'Closed' }),
      admin,
    ).expect(409);
    const end = (version: number, assignmentId: string) =>
      cmd(
        'post',
        `/operations/points/${pointId}/assignments/${assignmentId}/end`,
        { expectedVersion: version, reason: 'Nhân viên chuyển sang điểm khác' },
        admin,
      );
    await end(3, row.assignments[0].id).expect(409);
    // Paused blocks new bookings, not the existing intake's receipt.
    await cmd(
      'post',
      `/operations/points/${pointId}`,
      update(3, { status: 'Paused', reason: 'Tạm dừng nhận booking mới' }),
      admin,
    ).expect(200);
    const late = await actor();
    await cmd(
      'post',
      '/auction-intakes',
      intakeBody(await saleListing(late), { pointId }),
      late,
    ).expect(409);
    await cmd(
      'post',
      `/operations/auction-intakes/${intakes[0]}/receive`,
      { expectedVersion: 1, shelfCode: 'T-01' },
      pointStaff,
    ).expect(200);
    // A second assignment lets the first one end; audit names the point.
    const second = await actor(['STAFF']);
    await assign(4, second.id).expect(200);
    const ended = await end(5, row.assignments[0].id).expect(200);
    expect(ended.body).toMatchObject({ state: 'Ended', version: 6 });
    await call('get', '/me/point-assignments', pointStaff)
      .expect(200)
      .expect(({ body }) => expect(body.items).toEqual([]));
    await cmd(
      'post',
      `/operations/auction-intakes/${intakes[0]}/inspect`,
      { expectedVersion: 2, outcome: 'Pass', note: null },
      pointStaff,
    ).expect(403);
    const audit = await db.c.audit_events.findOne({
      receiptId: ended.body.id,
    });
    expect(audit).toMatchObject({
      pointId,
      action: 'endPointAssignment',
      reason: 'Nhân viên chuyển sang điểm khác',
      actorId: admin.id,
    });
  });

  it('NeedsEvidence blocks opening; an independent Staff member decides after the seller answers or the deadline (FR-T01/T02, POL-09)', async () => {
    const reviewerStaff = await actor(['STAFF']);
    await db.c.point_staff_assignments.insertOne({
      _id: randomUUID(),
      pointId: HANDOVER_POINT_A,
      userId: reviewerStaff.id,
      validFrom: new Date(),
      validTo: null,
      createdAt: new Date(),
    });
    const ok = {
      titleEditionMatches: true,
      privateMarksMatch: true,
      coverPagesMatch: true,
      notesAccessoriesMatch: true,
      suspectedCopy: false,
    };
    const suspicious = { ...ok, suspectedCopy: true };
    async function received() {
      const seller = await actor();
      const l = await saleListing(seller);
      const intakeId = (
        await cmd('post', '/auction-intakes', intakeBody(l), seller).expect(200)
      ).body.intakeId as string;
      await cmd(
        'post',
        `/operations/auction-intakes/${intakeId}/receive`,
        { expectedVersion: 1, shelfCode: 'E-01' },
        staff,
      ).expect(200);
      return { seller, intakeId };
    }
    const inspect = (intakeId: string, body: object) =>
      cmd(
        'post',
        `/operations/auction-intakes/${intakeId}/inspect`,
        { expectedVersion: 2, ...body },
        staff,
      );
    const decide = (
      intakeId: string,
      a: Actor,
      version: number,
      body: object,
    ) =>
      cmd(
        'post',
        `/operations/auction-intakes/${intakeId}/evidence-decision`,
        {
          expectedVersion: version,
          note: 'Đã đối chiếu bằng chứng người bán gửi',
          ...body,
        },
        a,
      );
    const answer = (intakeId: string, a: Actor, version: number) =>
      cmd(
        'post',
        `/me/auction-intakes/${intakeId}/evidence`,
        {
          expectedVersion: version,
          note: 'Dấu mộc ở trang 3 là của thư viện trường cũ, có ảnh phiếu mượn.',
        },
        a,
      );
    const request = {
      outcome: 'NeedsEvidence',
      note: 'Cần ảnh dấu mộc trang 3 để đối chiếu',
      checklist: suspicious,
    };

    const first = await received();
    // A suspected copy asks for evidence; a Pass needs every item matching.
    await inspect(first.intakeId, { ...request, checklist: null }).expect(422);
    await inspect(first.intakeId, {
      outcome: 'Pass',
      note: null,
      checklist: suspicious,
    }).expect(422);
    await inspect(first.intakeId, {
      outcome: 'Fail',
      note: 'Nghi bản sao',
      checklist: suspicious,
    }).expect(422);
    await inspect(first.intakeId, {
      outcome: 'Pass',
      note: null,
      checklist: { ...ok, coverPagesMatch: false },
    }).expect(422);
    const asked = await inspect(first.intakeId, request).expect(200);
    expect(asked.body).toMatchObject({ state: 'NeedsEvidence', version: 3 });
    const mine = await call(
      'get',
      `/me/auction-intakes/${first.intakeId}`,
      first.seller,
    ).expect(200);
    validates('AuctionIntake', mine.body);
    expect(mine.body).toMatchObject({
      state: 'NeedsEvidence',
      inspectionOutcome: 'NeedsEvidence',
      evidenceRequestedBy: null,
      evidenceSubmittedAt: null,
      reports: [
        expect.objectContaining({
          revision: 1,
          outcome: 'NeedsEvidence',
          checklist: suspicious,
        }),
      ],
    });
    expect(
      Date.parse(mine.body.evidenceDeadline) -
        Date.parse(mine.body.inspectedAt),
    ).toBe(48 * HOUR);
    expect(JSON.stringify(mine.body)).not.toContain(staff.id);
    await cmd(
      'post',
      `/operations/auction-intakes/${first.intakeId}/open`,
      { expectedVersion: 3 },
      staff,
    ).expect(409);
    // No answer yet and the window is open: nobody decides; the requester never does.
    await decide(first.intakeId, reviewerStaff, 3, { outcome: 'Fail' }).expect(
      409,
    );
    expect(
      (await decide(first.intakeId, staff, 3, { outcome: 'Pass' }).expect(403))
        .body.code,
    ).toBe('SelfReviewForbidden');
    await answer(first.intakeId, await actor(), 3).expect(404);
    const answered = await answer(first.intakeId, first.seller, 3).expect(200);
    expect(answered.body).toMatchObject({ state: 'NeedsEvidence', version: 4 });
    await answer(first.intakeId, first.seller, 4).expect(409);
    const passed = await decide(first.intakeId, reviewerStaff, 4, {
      outcome: 'Pass',
      checklist: ok,
    }).expect(200);
    expect(passed.body).toMatchObject({ state: 'Passed', version: 5 });
    const staffView = await call('get', '/operations/auction-intakes', staff)
      .expect(200)
      .then((r) =>
        r.body.items.find((i: { id: string }) => i.id === first.intakeId),
      );
    expect(staffView).toMatchObject({
      evidenceRequestedBy: staff.id,
      reports: [
        expect.objectContaining({ revision: 1, outcome: 'NeedsEvidence' }),
        expect.objectContaining({
          revision: 2,
          outcome: 'Pass',
          checklist: ok,
        }),
      ],
    });
    await cmd(
      'post',
      `/operations/auction-intakes/${first.intakeId}/open`,
      { expectedVersion: 5 },
      staff,
    ).expect(200);

    // Silence past the deadline: Fail only, never an automatic Pass.
    const second = await received();
    const requested = await inspect(second.intakeId, request).expect(200);
    await longSession(second.seller);
    await longSession(reviewerStaff);
    pinClock(new Date(Date.parse(requested.body.serverTime) + 48 * HOUR));
    await answer(second.intakeId, second.seller, 3).expect(409);
    await decide(second.intakeId, reviewerStaff, 3, {
      outcome: 'Pass',
      checklist: ok,
    }).expect(409);
    const failed = await decide(second.intakeId, reviewerStaff, 3, {
      outcome: 'Fail',
      note: 'Người bán không bổ sung bằng chứng trong hạn',
    }).expect(200);
    expect(failed.body.state).toBe('ReclaimRequired');
    expect(
      await db.c.auction_intakes.findOne({ _id: second.intakeId }),
    ).toMatchObject({
      reclaimReason: 'InspectionFailed',
      reclaimRequiredAt: new Date(failed.body.serverTime),
    });
    expect(
      await db.c.intake_inspection_reports.countDocuments({
        intakeId: second.intakeId,
      }),
    ).toBe(2);
  });

  it('incidents exist without an Order; an independent Admin decides within the protected value and the simulated fund (FR-T04, POL-42)', async () => {
    // A dedicated point: emergency close and an unfunded decision pause it.
    const created = await cmd(
      'post',
      '/operations/points',
      {
        code: `HCM-I-${randomBytes(3).toString('hex').toUpperCase()}`,
        name: 'Điểm sự cố kiểm thử',
        displayAddress: 'Bàn kiểm thử sự cố — không phải địa điểm thực tế',
        capacity: 5,
      },
      admin,
    ).expect(200);
    const pointId = created.body.pointId as string;
    await cmd(
      'post',
      `/operations/points/${pointId}/assignments`,
      { expectedVersion: 1, userId: staff.id },
      admin,
    ).expect(200);
    const activate = (version: number) =>
      cmd(
        'post',
        `/operations/points/${pointId}`,
        {
          expectedVersion: version,
          name: 'Điểm sự cố kiểm thử',
          displayAddress: 'Bàn kiểm thử sự cố — không phải địa điểm thực tế',
          capacity: 5,
          status: 'Active',
          reason: 'Mở lại điểm kiểm thử sự cố',
        },
        admin,
      );
    await activate(2).expect(200);
    const seller = await actor();
    const intakeId = (
      await cmd(
        'post',
        '/auction-intakes',
        intakeBody(await saleListing(seller), { pointId }),
        seller,
      ).expect(200)
    ).body.intakeId as string;
    const protectiveValue = (await db.c.auction_intakes.findOne({
      _id: intakeId,
    }))!.protectiveValue;
    const open = (a: Actor, over: object = {}) =>
      cmd(
        'post',
        '/operations/incidents',
        {
          pointId,
          intakeId,
          kind: 'Damaged',
          description: 'Bìa sách bị ướt khi đặt trên kệ gần cửa sổ tại điểm',
          ...over,
        },
        a,
      );
    await open(otherStaff).expect(403); // assigned to another point
    await open(await actor()).expect(403);
    await open(staff, { kind: 'EmergencyClose' }).expect(403);
    await open(seller).expect(403);
    const opened = await open(staff).expect(200);
    validates('PointCommandReceipt', opened.body);
    expect(opened.body).toMatchObject({
      entityType: 'PointIncident',
      state: 'Open',
      pointId,
    });
    const incidentId = opened.body.entityId as string;
    const staffList = await call('get', '/operations/incidents', staff).expect(
      200,
    );
    validates('PointIncidentList', staffList.body);
    const row = staffList.body.items.find(
      (i: { id: string }) => i.id === incidentId,
    );
    expect(row).toMatchObject({ protectedValue: protectiveValue, version: 1 });
    expect(
      (await call('get', '/operations/incidents', otherStaff).expect(200)).body
        .items,
    ).not.toContainEqual(expect.objectContaining({ id: incidentId }));
    // Independence: Staff, an Admin assigned to the point, the opener.
    const decide = (a: Actor, over: object = {}, key?: string) =>
      cmd(
        'post',
        `/operations/incidents/${incidentId}/decide`,
        {
          expectedVersion: 1,
          decision: 'Compensate',
          amount: 5_000,
          reason: 'Ảnh tại điểm xác nhận hư hỏng do điểm',
          ...over,
        },
        a,
        key,
      );
    await decide(staff).expect(403);
    const assignedAdmin = await actor(['ADMIN', 'STAFF']);
    await cmd(
      'post',
      `/operations/points/${pointId}/assignments`,
      { expectedVersion: 3, userId: assignedAdmin.id },
      admin,
    ).expect(200);
    expect((await decide(assignedAdmin).expect(403)).body.code).toBe(
      'SelfReviewForbidden',
    );
    await decide(admin, { amount: protectiveValue + 1 }).expect(422);
    await decide(admin, { decision: 'NoCompensation', amount: 5 }).expect(422);
    const fundBefore = await call('get', '/operations/incident-fund', admin)
      .expect(200)
      .then((r) => r.body);
    validates('IncidentFund', fundBefore);
    await call('get', '/operations/incident-fund', staff).expect(403);
    const key = randomUUID();
    const decided = await decide(admin, {}, key).expect(200);
    expect(decided.body).toMatchObject({ state: 'Decided', version: 2 });
    const replay = await decide(admin, {}, key).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(decided.body);
    await decide(admin, { expectedVersion: 2 }).expect(409);
    const fundAfter = (
      await call('get', '/operations/incident-fund', admin).expect(200)
    ).body;
    expect(fundAfter.balance).toBe(fundBefore.balance - 5_000);
    expect(fundAfter.entries[0]).toMatchObject({
      type: 'CompensationApproved',
      amount: 5_000,
      incidentId,
    });
    expect(
      await db.c.audit_events.findOne({ receiptId: decided.body.id }),
    ).toMatchObject({ pointId, action: 'decidePointIncident' });

    // Emergency close (Admin only) pauses new bookings at once.
    const emergency = await open(admin, {
      kind: 'EmergencyClose',
      intakeId: null,
      description: 'Mất điện kéo dài, tạm dừng nhận sách mới tại điểm',
    }).expect(200);
    expect(emergency.body.state).toBe('Open');
    const paused = (await db.c.handover_points.findOne({ _id: pointId }))!;
    expect(paused.status).toBe('Paused');
    // Without a book there is no protected value to compensate.
    await cmd(
      'post',
      `/operations/incidents/${emergency.body.entityId}/decide`,
      {
        expectedVersion: 1,
        decision: 'Compensate',
        amount: 1_000,
        reason: 'Thử bồi thường không gắn sách',
      },
      admin,
    ).expect(403); // the opener never decides
    await cmd(
      'post',
      `/operations/incidents/${emergency.body.entityId}/decide`,
      {
        expectedVersion: 1,
        decision: 'Compensate',
        amount: 1_000,
        reason: 'Thử bồi thường không gắn sách',
      },
      await actor(['ADMIN']),
    ).expect(422);
    await activate(paused.version).expect(200);

    // The fund runs short: the unfunded part is recorded, never invented,
    // and the point stops taking new bookings.
    const last = (await db.c.incident_fund_journal.findOne(
      {},
      { sort: { sequence: -1 } },
    ))!;
    await db.c.incident_fund_journal.insertOne({
      _id: randomUUID(),
      sequence: last.sequence + 1,
      type: 'CompensationApproved',
      amount: last.balanceAfter - 1_000,
      incidentId: randomUUID(),
      balanceAfter: 1_000,
      createdAt: new Date(),
    });
    const lost = await open(staff, {
      kind: 'Lost',
      description: 'Không tìm thấy sách trên kệ khi kiểm kê cuối ngày',
    }).expect(200);
    const short = await cmd(
      'post',
      `/operations/incidents/${lost.body.entityId}/decide`,
      {
        expectedVersion: 1,
        decision: 'Compensate',
        amount: 5_000,
        reason: 'Sách mất trong thời gian điểm giữ',
      },
      admin,
    ).expect(200);
    expect(short.body.state).toBe('Underfunded');
    expect(
      await db.c.point_incidents.findOne({ _id: lost.body.entityId }),
    ).toMatchObject({ fundedAmount: 1_000, unfundedAmount: 4_000 });
    const after = (await db.c.handover_points.findOne({ _id: pointId }))!;
    expect(after.status).toBe('Paused');
    expect(
      (await call('get', '/operations/incident-fund', admin).expect(200)).body
        .balance,
    ).toBe(0);
  });

  it('overdue inspection and reclaim are derived for the Admin and never act on their own (POL-31, POL-34)', async () => {
    async function received(shelfCode: string) {
      const seller = await actor();
      const intakeId = (
        await cmd(
          'post',
          '/auction-intakes',
          intakeBody(await saleListing(seller)),
          seller,
        ).expect(200)
      ).body.intakeId as string;
      const receipt = await cmd(
        'post',
        `/operations/auction-intakes/${intakeId}/receive`,
        { expectedVersion: 1, shelfCode },
        staff,
      ).expect(200);
      return { intakeId, at: Date.parse(receipt.body.serverTime) };
    }
    const waiting = await received('D-01');
    const failed = await received('D-02');
    const reclaim = await cmd(
      'post',
      `/operations/auction-intakes/${failed.intakeId}/inspect`,
      { expectedVersion: 2, outcome: 'Fail', note: 'Bìa rách khác mô tả' },
      staff,
    ).expect(200);
    const reclaimAt = Date.parse(reclaim.body.serverTime);
    const queue = (
      await call('get', '/operations/auction-intakes', staff).expect(200)
    ).body.items as { id: string }[];
    expect(queue.find((i) => i.id === waiting.intakeId)).toMatchObject({
      inspectionDueAt: new Date(waiting.at + 24 * HOUR).toISOString(),
      reclaimDueAt: null,
    });
    expect(queue.find((i) => i.id === failed.intakeId)).toMatchObject({
      inspectionDueAt: null,
      reclaimDueAt: new Date(reclaimAt + 72 * HOUR).toISOString(),
    });
    const escalations = async () => {
      const r = await call('get', '/operations/escalations', admin).expect(200);
      validates('PointEscalationList', r.body);
      return r.body.items as { intakeId: string; kind: string }[];
    };
    await call('get', '/operations/escalations', staff).expect(403);
    expect(
      (await escalations()).filter((e) =>
        [waiting.intakeId, failed.intakeId].includes(e.intakeId),
      ),
    ).toEqual([]);
    pinClock(new Date(reclaimAt + 72 * HOUR));
    expect(await escalations()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intakeId: waiting.intakeId,
          kind: 'InspectionOverdue',
          state: 'Received',
        }),
        expect.objectContaining({
          intakeId: failed.intakeId,
          kind: 'ReclaimOverdue',
        }),
      ]),
    );
    pinClock(new Date(reclaimAt + 72 * HOUR + 14 * 24 * HOUR));
    expect(
      (await escalations()).find((e) => e.intakeId === failed.intakeId),
    ).toMatchObject({ kind: 'ReclaimEscalated' });
    // Reading changed nothing: no automatic Pass, Fail or confiscation.
    expect(
      await db.c.auction_intakes.findOne({ _id: waiting.intakeId }),
    ).toMatchObject({ state: 'Received', version: 2 });
    expect(
      await db.c.auction_intakes.findOne({ _id: failed.intakeId }),
    ).toMatchObject({ state: 'ReclaimRequired', version: 3 });
  });

  it('public book reads use only the inspected revision and never bypass ordinary shelf custody', async () => {
    const o = await openAuction();
    const response = await call('get', `/auctions/${o.auctionId}`).expect(200);
    validates('PublicAuction', response.body);
    const book = response.body.auction.book;
    expect(book.condition).toBe('Good');
    expect(book.photos.length).toBeGreaterThan(0);
    expect(Object.keys(book).sort()).toEqual(
      [
        'accessories',
        'authors',
        'condition',
        'coverNote',
        'description',
        'hasMissingPages',
        'notes',
        'pages',
        'photos',
        'revisionId',
      ].sort(),
    );
    const mediaId = book.photos[0].id;
    const photo = await call(
      'get',
      `/auctions/${o.auctionId}/photos/${mediaId}`,
    ).expect(200);
    validates('MediaRead', photo.body);
    expect(photo.headers['cache-control']).toBe('no-store');
    await call('get', `/listings/${o.listing.id}`).expect(404);
    await call('get', `/auctions/${o.auctionId}/photos/${randomUUID()}`).expect(
      404,
    );
    const other = await openAuction();
    await call('get', `/auctions/${other.auctionId}/photos/${mediaId}`).expect(
      404,
    );
    await db.c.listing_media.updateOne(
      { _id: mediaId },
      { $set: { purgedAt: new Date() } },
    );
    await call('get', `/auctions/${o.auctionId}/photos/${mediaId}`).expect(404);
    await db.c.listing_media.updateOne(
      { _id: mediaId },
      { $set: { purgedAt: null } },
    );
    await db.c.users.updateOne(
      { _id: o.seller.id },
      { $set: { status: 'LOCKED' } },
    );
    expect(
      (await call('get', `/auctions/${o.auctionId}`).expect(200)).body.auction
        .book,
    ).toBeNull();
    await call('get', `/auctions/${o.auctionId}/photos/${mediaId}`).expect(404);
    await db.c.users.updateOne(
      { _id: o.seller.id },
      { $set: { status: 'ACTIVE' } },
    );
    await db.c.auction_intakes.updateOne(
      { _id: o.intakeId },
      { $set: { inspectionOutcome: 'Fail' } },
    );
    await call('get', `/auctions/${o.auctionId}/photos/${mediaId}`).expect(404);
    await db.c.auction_intakes.updateOne(
      { _id: o.intakeId },
      { $set: { inspectionOutcome: 'Pass' } },
    );
    await db.c.listings.updateOne(
      { _id: o.listing.id },
      { $set: { visibility: 'Hidden' } },
    );
    await call('get', `/auctions/${o.auctionId}/photos/${mediaId}`).expect(404);
    await db.c.listings.updateOne(
      { _id: o.listing.id },
      { $set: { visibility: 'Visible' } },
    );
    vi.spyOn(storage, 'signedRead').mockImplementationOnce(async (key) => {
      await db.c.listings.updateOne(
        { _id: o.listing.id },
        { $set: { visibility: 'Hidden' } },
      );
      return {
        url: 'https://storage.test/' + key,
        expiresAt: new Date(Date.now() + 120000).toISOString(),
      };
    });
    await call('get', `/auctions/${o.auctionId}/photos/${mediaId}`).expect(404);
    await db.c.listings.updateOne(
      { _id: o.listing.id },
      { $set: { visibility: 'Visible' } },
    );
  });

  it('private auction pages bind ownership, payment state and keyset cursor to the caller', async () => {
    const first = await openAuction();
    const second = await openAuction();
    const bidder = await actor();
    const stranger = await actor();
    await bid(first.auctionId, bidder, 250_000).expect(200);
    await auto(second.auctionId, bidder, 400_000).expect(200);
    await call('get', '/me/auctions').expect(401);
    await call('get', '/me/auctions', staff).expect(403);
    const unrelated = await call('get', '/me/auctions', stranger).expect(200);
    expect(unrelated.body.items).toEqual([]);
    const page = await call('get', '/me/auctions?limit=1', bidder).expect(200);
    validates('MyAuctionPage', page.body);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].role).toBe('Bidder');
    expect(page.body.items[0].leading).toBe(true);
    expect(JSON.stringify(page.body)).not.toMatch(
      /ownLevel|maxAmount|levelSequence|sellerId|bidderId/,
    );
    expect(page.body.nextCursor).toBeTruthy();
    const next = await call(
      'get',
      `/me/auctions?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`,
      bidder,
    ).expect(200);
    expect(next.body.items).toHaveLength(1);
    expect(next.body.items[0].auction.id).not.toBe(
      page.body.items[0].auction.id,
    );
    await call(
      'get',
      `/me/auctions?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`,
      stranger,
    ).expect(400);
    await call(
      'get',
      `/me/auctions?view=active&limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`,
      bidder,
    ).expect(400);
    const selling = await call(
      'get',
      '/me/auctions?view=selling',
      first.seller,
    ).expect(200);
    expect(
      selling.body.items.map((i: { auction: { id: string } }) => i.auction.id),
    ).toEqual([first.auctionId]);
    expect(selling.body.items[0].role).toBe('Seller');
    expect(
      (await call('get', '/me/auctions?view=selling', bidder).expect(200)).body
        .items,
    ).toEqual([]);
    const won = await openAuction();
    await cmd(
      'post',
      `/auctions/${won.auctionId}/buy-now`,
      { fulfillmentMethod: 'SelfCollect' },
      bidder,
    ).expect(200);
    // ADR 0043: payment is due only once the 60-second window has closed.
    await closeAt(won.auctionId);
    const payable = await call(
      'get',
      '/me/auctions?view=payment',
      bidder,
    ).expect(200);
    expect(
      payable.body.items.map((i: { auction: { id: string } }) => i.auction.id),
    ).toEqual([won.auctionId]);
    expect(payable.body.items[0].needsPayment).toBe(true);
    expect(payable.body.items[0].won).toBe(true);
    await call('get', '/me/auctions?view=invalid', bidder).expect(400);
  });

  it('owner auction lookup filters before the recent-intake limit and rechecks current authorization', async () => {
    const first = await passedIntake();
    const opened = await publish(first.intakeId, first.seller).expect(200);
    const auctionId = opened.body.auctionId as string;
    const historyListing = await saleListing(first.seller);
    // Real commands create the history: no final-state fixture or raised limit.
    for (let n = 0; n < 50; n++) {
      const current = (await db.c.listings.findOne({ _id: historyListing.id }))!;
      const next = await cmd('post', '/auction-intakes', intakeBody({ id: current._id, version: current.version }), first.seller).expect(200);
      await cmd('post', `/auction-intakes/${next.body.intakeId}/cancel`, { expectedVersion: 1 }, first.seller).expect(200);
    }
    const recent = await call('get', '/me/auction-intakes', first.seller).expect(200);
    expect(recent.body.items).toHaveLength(50);
    expect(recent.body.items.some((i: { id: string }) => i.id === first.intakeId)).toBe(false);
    const route = `/me/auction-intakes?auctionId=${auctionId}`;
    const focused = await call('get', route, first.seller).expect(200);
    validates('AuctionIntakeList', focused.body);
    expect(focused.body.items).toHaveLength(1);
    expect(focused.body.items[0]).toMatchObject({ id: first.intakeId, auctionId });
    // The existing shared response requires the field but redacts it to null.
    expect(focused.body.items[0].shelfCode).toBeNull();
    expect(focused.body.items[0]).not.toHaveProperty('inspectorId');
    expect((await call('get', route, await actor()).expect(200)).body.items).toEqual([]);
    expect((await call('get', `/me/auction-intakes?auctionId=${randomUUID()}`, first.seller).expect(200)).body.items).toEqual([]);
    await call('get', route).expect(401);
    await call('get', route, staff).expect(403);
    await call('get', '/me/auction-intakes?auctionId=not-a-uuid', first.seller).expect(400);
    await db.c.users.updateOne({ _id: first.seller.id }, { $set: { status: 'LOCKED', updatedAt: new Date() }, $inc: { lockSeq: 1 } });
    await call('get', route, first.seller).expect(403);
    await db.c.users.updateOne({ _id: first.seller.id }, { $set: { status: 'ACTIVE', updatedAt: new Date() }, $inc: { lockSeq: 1 } });
    await db.c.auth_sessions.updateOne({ _id: first.seller.sessionId }, { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } });
    await call('get', route, first.seller).expect(401);
  });

  it('AC-AU01/02: approved shelf listings enter; intake holds commitment and slot', async () => {
    // ADR 0042 §Update 27/10: an approved shelf book (either channel, any
    // mode) may go to auction. The intake hides it from the marketplace
    // until the intake closes, and cancelling puts it back on the shelf.
    const shelfSeller = await actor();
    const marketplace = await saleListing(shelfSeller, 'Sale', 'Marketplace');
    await call('get', `/listings/${marketplace.id}`).expect(200);
    const fromShelf = await cmd(
      'post',
      '/auction-intakes',
      intakeBody(marketplace, { declaredValue: 90_000 }),
      shelfSeller,
    ).expect(200);
    expect(await db.c.listings.findOne({ _id: marketplace.id })).toMatchObject({
      trade: 'Reserved',
    });
    expect(
      await db.c.auction_intakes.findOne({ _id: fromShelf.body.intakeId }),
    ).toMatchObject({ protectiveValue: 90_000 });
    await call('get', `/listings/${marketplace.id}`).expect(404);
    const shelf = await call('get', '/listings').expect(200);
    expect(
      shelf.body.items.map((i: { id: string }) => i.id),
    ).not.toContain(marketplace.id);
    await cmd(
      'post',
      `/auction-intakes/${fromShelf.body.intakeId}/cancel`,
      { expectedVersion: 1 },
      shelfSeller,
    ).expect(200);
    expect(await db.c.listings.findOne({ _id: marketplace.id })).toMatchObject({
      trade: 'Available',
    });
    await call('get', `/listings/${marketplace.id}`).expect(200);
    // Without a declared value the shelf price is the protective value.
    const bothSeller = await actor();
    const both = await saleListing(bothSeller, 'Both', 'Marketplace');
    const fromBoth = await cmd(
      'post',
      '/auction-intakes',
      intakeBody(both),
      bothSeller,
    ).expect(200);
    expect(
      await db.c.auction_intakes.findOne({ _id: fromBoth.body.intakeId }),
    ).toMatchObject({ protectiveValue: listingContent.salePrice });
    await cmd(
      'post',
      '/auction-intakes',
      intakeBody(both, { declaredValue: 5_000 }),
      bothSeller,
    ).expect(422);

    const seller = await actor();
    const l = await saleListing(seller);
    // An approved auction listing is never on the marketplace (ADR 0042).
    await call('get', `/listings/${l.id}`).expect(404);
    const stranger = await actor();
    await cmd('post', '/auction-intakes', intakeBody(l), stranger).expect(404);
    await cmd(
      'post',
      '/auction-intakes',
      intakeBody(l, { buyNowPrice: 225_000 }),
      seller,
    ).expect(422);
    // ADR 0068: a step is a multiple of 1.000đ from 1.000đ to 10.000.000đ.
    for (const step of [0, 500, 1_500, 25_500, 10_001_000])
      await cmd('post', '/auction-intakes', intakeBody(l, { step }), seller).expect(422);
    await cmd(
      'post',
      '/auction-intakes',
      intakeBody(l, { step: 100_000, buyNowPrice: 650_000 }),
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
    // FR-H08: back to the owner as an unsubmitted Draft copy of the revision
    // (photos kept), so it is corrected and reviewed before anyone buys it.
    const back = (await db.c.listings.findOne({ _id: l.id }))!;
    expect(back).toMatchObject({ trade: 'Available', moderation: 'Draft' });
    expect(
      await db.c.listing_revisions.findOne({ _id: back.currentRevisionId! }),
    ).toMatchObject({ submittedAt: null, listingId: l.id });
    expect(
      await db.c.revision_media.countDocuments({
        revisionId: back.currentRevisionId!,
      }),
    ).toBeGreaterThan(0);
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
      // ADR 0047: still below the Buy Now price, so it stays offered.
      buyNowPrice: 600_000,
      phase: 'Live',
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

  it('ADR 0068: preset and custom bid steps are stored and keep the price grid', async () => {
    for (const step of [1_000, 10_000, 15_000, 20_000, 50_000, 100_000, 10_000_000]) {
      const seller = await actor();
      const l = await saleListing(seller);
      const created = await cmd(
        'post',
        '/auction-intakes',
        intakeBody(l, { step, startPrice: 200_000, buyNowPrice: 200_000 + 2 * step }),
        seller,
      ).expect(200);
      expect(
        await db.c.auction_intakes.findOne({ _id: created.body.intakeId }),
      ).toMatchObject({ step, startPrice: 200_000, buyNowPrice: 200_000 + 2 * step });
    }
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
    await bid(auctionId, c, Number.MAX_SAFE_INTEGER + 1).expect(422);
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

  it('AC-AU07/ADR 0047: a racing first bid and Buy Now serialize; Buy Now still wins after the bid', async () => {
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
      // Buy Now is offered before and after the 200k bid.
      expect(r2.status).toBe(200);
      const a = (await db.c.auctions.findOne({ _id: auctionId }))!;
      // ADR 0043: Buy Now leads at its price; a later 200k bid is too low.
      if (r1.status !== 200) expect(r1.body.code).toBe('BidTooLow');
      expect(a).toMatchObject({
        state: 'Active',
        leaderId: y.id,
        currentPrice: 600_000,
        bidderCount: r1.status === 200 ? 2 : 1,
        winnerId: null,
      });
      // ADR 0070: y was not leading, so the others get 5 minutes.
      expect(a.endAt.getTime() - a.buyNowAt!.getTime()).toBe(5 * 60_000);
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
    // ADR 0080: keyed by the version the sweep read (one before the close).
    expect(
      await db.c.mutation_receipts.countDocuments({
        operation: 'closeAuction',
        key: stepKey(auctionId, closed.version - 1, 'close'),
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

  it('AC-AU06/ADR 0043: Buy Now opens a 60-second window; the unbeaten buyer wins and pays', async () => {
    const { auctionId } = await openAuction();
    const buyer = await actor();
    const key = randomUUID();
    const body = { fulfillmentMethod: 'SelfCollect' };
    const r = await cmd(
      'post',
      `/auctions/${auctionId}/buy-now`,
      body,
      buyer,
      key,
    ).expect(200);
    validates('AuctionCommandReceipt', r.body);
    expect(r.body).toMatchObject({
      state: 'Active',
      orderId: null,
      currentPrice: 600_000,
      minimumBid: 650_000,
      leading: true,
    });
    const replay = await cmd(
      'post',
      `/auctions/${auctionId}/buy-now`,
      body,
      buyer,
      key,
    ).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(r.body);
    const a = (await db.c.auctions.findOne({ _id: auctionId }))!;
    expect(a).toMatchObject({
      state: 'Active',
      leaderId: buyer.id,
      currentPrice: 600_000,
      bidderCount: 1,
      bidCount: 1,
      orderId: null,
    });
    // ADR 0070: a Buy Now by a non-leader opens a 5-minute window.
    expect(a.endAt.getTime() - a.buyNowAt!.getTime()).toBe(5 * 60_000);
    expect(
      await db.c.auction_bids.countDocuments({ auctionId, kind: 'BuyNow' }),
    ).toBe(1);
    const pub = await call('get', `/auctions/${auctionId}`).expect(200);
    validates('PublicAuction', pub.body);
    expect(pub.body.auction).toMatchObject({
      buyNowPrice: null,
      buyNowAt: a.buyNowAt!.toISOString(),
      endAt: a.endAt.toISOString(),
      minimumBid: 650_000,
    });
    const own = await call(
      'get',
      `/me/auctions/${auctionId}/participation`,
      buyer,
    ).expect(200);
    expect(own.body).toMatchObject({
      boughtNow: true,
      leading: true,
      won: false,
      orderId: null,
    });

    const closed = await closeAt(auctionId);
    expect(closed).toMatchObject({
      state: 'AwaitingWinnerPayment',
      winnerId: buyer.id,
      finalPrice: 600_000,
    });
    expect(closed.paymentDeadline!.getTime() - closed.endAt.getTime()).toBe(
      24 * HOUR,
    );
    await longSession(buyer);
    await fund(buyer, 600_000);
    pinClock(new Date(closed.closedAt!.getTime() + 60_000));
    await payOrder(closed.orderId!, buyer).expect(200);
    vi.restoreAllMocks();
    expect(await db.c.auctions.findOne({ _id: auctionId })).toMatchObject({
      state: 'Sold',
    });
  });

  it('ADR 0043: a rival outbids inside the window; bids after it are refused', async () => {
    const { auctionId } = await openAuction();
    const [buyer, rival] = [await actor(), await actor()];
    await cmd(
      'post',
      `/auctions/${auctionId}/buy-now`,
      { fulfillmentMethod: 'SelfCollect' },
      buyer,
    ).expect(200);
    const window = (await db.c.auctions.findOne({ _id: auctionId }))!.endAt;
    expect((await bid(auctionId, rival, 600_000).expect(409)).body.code).toBe(
      'BidTooLow',
    );
    await bid(auctionId, rival, 650_000).expect(200);
    const a = (await db.c.auctions.findOne({ _id: auctionId }))!;
    // Later bids do not extend the window again.
    expect(a).toMatchObject({ leaderId: rival.id, currentPrice: 650_000 });
    expect(a.endAt).toEqual(window);
    expect(
      await db.c.member_notifications.countDocuments({
        userId: buyer.id,
        targetId: auctionId,
        kind: 'AuctionOutbid',
      }),
    ).toBe(1);
    // Server time decides the end even before the worker runs.
    await longSession(buyer);
    pinClock(window);
    const late = await bid(auctionId, buyer, 700_000).expect(409);
    expect(late.body.code).toBe('AuctionClosed');
    vi.restoreAllMocks();
    expect(await closeAt(auctionId)).toMatchObject({
      state: 'AwaitingWinnerPayment',
      winnerId: rival.id,
      finalPrice: 650_000,
    });
  });

  it('ADR 0043: Buy Now near the original end keeps that end', async () => {
    const { auctionId } = await openAuction();
    const buyer = await actor();
    const original = (await db.c.auctions.findOne({ _id: auctionId }))!.endAt;
    await longSession(buyer);
    pinClock(new Date(original.getTime() - 30_000));
    await cmd(
      'post',
      `/auctions/${auctionId}/buy-now`,
      { fulfillmentMethod: 'SelfCollect' },
      buyer,
    ).expect(200);
    vi.restoreAllMocks();
    const a = (await db.c.auctions.findOne({ _id: auctionId }))!;
    expect(a.endAt).toEqual(original);
    expect(a.buyNowAt!.getTime()).toBe(original.getTime() - 30_000);
  });

  describe('ADR 0047: seller-published and scheduled auctions', () => {
    const later = (ms: number) => new Date(Date.now() + ms).toISOString();
    const buyNowCmd = (auctionId: string, a: Actor) =>
      cmd(
        'post',
        `/auctions/${auctionId}/buy-now`,
        { fulfillmentMethod: 'SelfCollect' },
        a,
      );
    const publicIds = async (query = '') =>
      (await call('get', `/auctions${query}`).expect(200)).body.items.map(
        (i: { id: string }) => i.id,
      );

    it('only the owner publishes a Passed intake; limits, stale versions and replay', async () => {
      const { seller, intakeId } = await passedIntake();
      const stranger = await actor();
      await publish(intakeId, stranger).expect(404);
      await publish(intakeId, staff).expect(403);
      await publish(intakeId, seller, { durationSeconds: 3599 }).expect(422);
      await publish(intakeId, seller, { durationSeconds: 604_801 }).expect(422);
      for (const startAt of [later(-60_000), later(60_000), later(8 * 24 * HOUR)])
        expect(
          (await publish(intakeId, seller, { startAt }).expect(422)).body
            .fieldErrors[0].path,
        ).toBe('startAt');
      await publish(intakeId, seller, { expectedVersion: 2 }).expect(409);

      const startAt = later(2 * HOUR);
      const key = randomUUID();
      const r = await publish(
        intakeId,
        seller,
        { startAt, durationSeconds: 6 * 3600 },
        key,
      ).expect(200);
      validates('AuctionCommandReceipt', r.body);
      expect(r.body).toMatchObject({ state: 'Auctioning', entityType: 'AuctionIntake' });
      const replay = await publish(
        intakeId,
        seller,
        { startAt, durationSeconds: 6 * 3600 },
        key,
      ).expect(200);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(replay.body).toEqual(r.body);
      await publish(intakeId, seller, { startAt, durationSeconds: 7 * 3600 }, key).expect(409);
      expect(
        (await publish(intakeId, seller, { expectedVersion: 4 }).expect(409)).body
          .code,
      ).toBe('InvalidState');
      const docs = await db.c.auctions.find({ intakeId }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        publishedBy: 'Seller',
        scheduleRevision: 0,
        state: 'Active',
      });
      expect(docs[0].startAt.toISOString()).toBe(startAt);
      expect(docs[0].endAt.getTime() - docs[0].startAt.getTime()).toBe(6 * HOUR);
      expect(docs[0].plannedEndAt).toEqual(docs[0].endAt);
    });

    it('publish before inspection passes is refused', async () => {
      const seller = await actor();
      const l = await saleListing(seller);
      const created = await cmd(
        'post',
        '/auction-intakes',
        intakeBody(l),
        seller,
      ).expect(200);
      const r = await publish(created.body.intakeId, seller, {
        expectedVersion: 1,
      }).expect(409);
      expect(r.body.code).toBe('InvalidState');
    });

    it('two publishes with different keys create exactly one auction', async () => {
      const { seller, intakeId } = await passedIntake();
      const replies = await Promise.all([
        publish(intakeId, seller),
        publish(intakeId, seller, { startAt: later(HOUR) }),
      ]);
      expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await db.c.auctions.countDocuments({ intakeId })).toBe(1);
    });

    it('a scheduled auction is listed as upcoming and refuses bids and Buy Now until its start', async () => {
      const { seller, intakeId } = await passedIntake();
      await publish(intakeId, seller, {
        startAt: later(2 * HOUR),
        durationSeconds: 3 * 3600,
      }).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      expect(await publicIds()).not.toContain(a._id);
      expect(await publicIds('?phase=upcoming')).toContain(a._id);
      await call('get', '/auctions?phase=soon').expect(400);
      const pub = await call('get', `/auctions/${a._id}`).expect(200);
      validates('PublicAuction', pub.body);
      expect(pub.body.auction).toMatchObject({
        phase: 'Scheduled',
        buyNowPrice: 600_000,
        version: 1,
      });
      const mine = await call('get', '/me/auctions?view=upcoming', seller).expect(200);
      expect(mine.body.items.map((i: { auction: { id: string } }) => i.auction.id)).toEqual([a._id]);

      const [x, y] = [await actor(), await actor()];
      for (const b of [x, y]) await longSession(b);
      pinClock(new Date(a.startAt.getTime() - 1));
      expect((await bid(a._id, x, 200_000).expect(409)).body.code).toBe(
        'AuctionNotStarted',
      );
      expect((await auto(a._id, x, 300_000).expect(409)).body.code).toBe(
        'AuctionNotStarted',
      );
      expect((await buyNowCmd(a._id, y).expect(409)).body.code).toBe(
        'AuctionNotStarted',
      );
      vi.restoreAllMocks();
      pinClock(a.startAt);
      await bid(a._id, x, 200_000).expect(200);
      // ADR 0047: Buy Now stays offered after the first bid.
      const bought = await buyNowCmd(a._id, y).expect(200);
      expect(bought.body).toMatchObject({ currentPrice: 600_000, leading: true });
      vi.restoreAllMocks();
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(after.endAt.getTime()).toBe(a.startAt.getTime() + 5 * 60_000);
    });

    it('the seller edits the time before the first bid only; live edits move the end', async () => {
      const { seller, intakeId } = await passedIntake();
      await publish(intakeId, seller, { startAt: later(3 * HOUR) }).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      const stranger = await actor();
      await reschedule(a._id, stranger, {
        expectedVersion: 1,
        startAt: null,
        durationSeconds: 24 * 3600,
      }).expect(404);
      await reschedule(a._id, seller, {
        expectedVersion: 2,
        startAt: null,
        durationSeconds: 24 * 3600,
      }).expect(409);
      // Scheduled: move the start later, then start it now for 2 hours.
      const moved = later(5 * HOUR);
      await reschedule(a._id, seller, {
        expectedVersion: 1,
        startAt: moved,
        durationSeconds: 12 * 3600,
      }).expect(200);
      expect((await db.c.auctions.findOne({ _id: a._id }))!.startAt.toISOString()).toBe(moved);
      const live = await reschedule(a._id, seller, {
        expectedVersion: 2,
        startAt: null,
        durationSeconds: 2 * 3600,
      }).expect(200);
      validates('AuctionCommandReceipt', live.body);
      const started = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(started.scheduleRevision).toBe(2);
      expect(await publicIds()).toContain(a._id);
      // Live: the start is fixed and at least one hour must remain.
      await reschedule(a._id, seller, {
        expectedVersion: 3,
        startAt: later(HOUR),
        durationSeconds: 24 * 3600,
      }).expect(422);
      await reschedule(a._id, seller, {
        expectedVersion: 3,
        startAt: null,
        durationSeconds: 1 * 3600,
      }).expect(422);
      await reschedule(a._id, seller, {
        expectedVersion: 3,
        startAt: null,
        durationSeconds: 48 * 3600,
      }).expect(200);
      const extended = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(extended.endAt.getTime() - extended.startAt.getTime()).toBe(48 * HOUR);
      // After the first bid the time is final (FR-AU02).
      await bid(a._id, await actor(), 200_000).expect(200);
      const locked = await reschedule(a._id, seller, {
        expectedVersion: 5,
        startAt: null,
        durationSeconds: 24 * 3600,
      }).expect(409);
      expect(locked.body.code).toBe('InvalidState');
    });

    it('race: an edit and the first bid serialize under the auction lock', async () => {
      for (let round = 0; round < 3; round++) {
        const { seller, intakeId } = await passedIntake();
        await publish(intakeId, seller).expect(200);
        const a = (await db.c.auctions.findOne({ intakeId }))!;
        const [edit, first] = await Promise.all([
          reschedule(a._id, seller, {
            expectedVersion: 1,
            startAt: null,
            durationSeconds: 36 * 3600,
          }),
          bid(a._id, await actor(), 200_000),
        ]);
        expect(first.status).toBe(200);
        const after = (await db.c.auctions.findOne({ _id: a._id }))!;
        if (edit.status === 200)
          expect(after.endAt.getTime() - after.startAt.getTime()).toBe(36 * HOUR);
        else {
          expect(edit.body.code).toMatch(/InvalidState|VersionConflict/);
          expect(after.endAt).toEqual(a.endAt);
        }
        expect(after.bidderCount).toBe(1);
      }
    });

    it('ADR 0070: the leader may Buy Now with a 60-second window', async () => {
      const { seller, intakeId } = await passedIntake();
      await publish(intakeId, seller).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      const [x, y] = [await actor(), await actor()];
      await bid(a._id, x, 300_000).expect(200);
      const bought = await buyNowCmd(a._id, x).expect(200);
      expect(bought.body).toMatchObject({ currentPrice: 600_000, leading: true });
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(after).toMatchObject({ leaderId: x.id, currentPrice: 600_000, bidCount: 2 });
      expect(after.endAt.getTime() - after.buyNowAt!.getTime()).toBe(60_000);
      expect(
        await db.c.auction_bids.findOne({ auctionId: a._id, kind: 'BuyNow' }),
      ).toMatchObject({ bidderId: x.id, amount: 600_000, priceBefore: 300_000, priceAfter: 600_000, leaderAfter: x.id });
      // Others still outbid from Buy Now + step inside the window.
      await bid(a._id, y, 650_000).expect(200);
      expect((await db.c.auctions.findOne({ _id: a._id }))!.leaderId).toBe(y.id);
    });

    it('ADR 0074: a bid reaching Buy Now ends by the Challenge window instead of waiting for plannedEndAt', async () => {
      const { seller, intakeId } = await passedIntake();
      await publish(intakeId, seller).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      expect(a.buyNowMode).toBe('Challenge');
      const [x, y] = [await actor(), await actor()];
      await bid(a._id, x, 300_000).expect(200);
      await bid(a._id, y, 600_000).expect(200);
      const pub = await call('get', `/auctions/${a._id}`).expect(200);
      validates('PublicAuction', pub.body);
      expect(pub.body.auction).toMatchObject({ buyNowPrice: null, buyNowMode: 'Challenge' });
      expect((await buyNowCmd(a._id, x).expect(409)).body.code).toBe('InvalidState');
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(after.buyNowAt).not.toBeNull();
      // y was not leading: the ADR 0070 rival window, far before plannedEndAt.
      expect(after.endAt.getTime() - after.buyNowAt!.getTime()).toBe(5 * 60_000);
      expect(after.endAt.getTime()).toBeLessThan(after.plannedEndAt.getTime());
      // A normal bid row, not a fabricated Buy Now.
      expect(await db.c.auction_bids.countDocuments({ auctionId: a._id, kind: 'BuyNow' })).toBe(0);
      // Others may still outbid inside the window; the end does not move again.
      await bid(a._id, x, 650_000).expect(200);
      expect((await db.c.auctions.findOne({ _id: a._id }))!.endAt).toEqual(after.endAt);
    });

    it('ADR 0074: an Auto ceiling pushed to Buy Now by a rival also ends the auction', async () => {
      const { seller, intakeId } = await passedIntake();
      await publish(intakeId, seller).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      const [x, y] = [await actor(), await actor()];
      await auto(a._id, x, 900_000).expect(200);
      await bid(a._id, y, 550_000).expect(200);
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(after).toMatchObject({ leaderId: x.id, currentPrice: 600_000 });
      expect(after.buyNowAt).not.toBeNull();
      expect(after.endAt.getTime() - after.buyNowAt!.getTime()).toBe(5 * 60_000);
    });

    it('ADR 0074: Instant Buy Now ends the auction at once and the buyer wins', async () => {
      const { seller, intakeId } = await passedIntake({ buyNowMode: 'Instant' });
      const intake = await call('get', `/me/auction-intakes/${intakeId}`, seller).expect(200);
      expect(intake.body.buyNowMode ?? intake.body.intake?.buyNowMode).toBe('Instant');
      await publish(intakeId, seller).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      expect(a.buyNowMode).toBe('Instant');
      const [x, buyer] = [await actor(), await actor()];
      await bid(a._id, x, 300_000).expect(200);
      await buyNowCmd(a._id, buyer).expect(200);
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(after).toMatchObject({ leaderId: buyer.id, currentPrice: 600_000 });
      expect(after.endAt).toEqual(after.buyNowAt);
      // No window: later bids and a second Buy Now are refused.
      expect((await bid(a._id, x, 650_000).expect(409)).body.code).toBe('AuctionClosed');
      await buyNowCmd(a._id, x).expect(409);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({
        state: 'AwaitingWinnerPayment',
        winnerId: buyer.id,
        finalPrice: 600_000,
      });
    });

    it('ADR 0074: Instant caps bids and Auto at the Buy Now price; reaching it ends at once', async () => {
      const { seller, intakeId } = await passedIntake({ buyNowMode: 'Instant' });
      await publish(intakeId, seller).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      const [x, y] = [await actor(), await actor()];
      expect((await bid(a._id, x, 650_000).expect(409)).body.code).toBe('InvalidState');
      expect((await auto(a._id, x, 650_000).expect(409)).body.code).toBe('InvalidState');
      expect(await db.c.auction_bids.countDocuments({ auctionId: a._id })).toBe(0);
      await auto(a._id, x, 600_000).expect(200);
      await bid(a._id, y, 550_000).expect(200);
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      // x's ceiling meets the Buy Now price: x wins at it, now.
      expect(after).toMatchObject({ leaderId: x.id, currentPrice: 600_000 });
      expect(after.endAt).toEqual(after.buyNowAt);
      expect((await closeAt(a._id))).toMatchObject({ winnerId: x.id, finalPrice: 600_000 });
    });

    it('ADR 0074: Instant needs a Buy Now price; the mode defaults to Challenge', async () => {
      const seller = await actor();
      const l = await saleListing(seller);
      const bad = await cmd(
        'post',
        '/auction-intakes',
        intakeBody(l, { buyNowPrice: null, buyNowMode: 'Instant' }),
        seller,
      ).expect(422);
      expect(JSON.stringify(bad.body)).toContain('buyNowMode');
      const created = await cmd('post', '/auction-intakes', intakeBody(l), seller).expect(200);
      expect(
        (await db.c.auction_intakes.findOne({ _id: created.body.intakeId }))!.buyNowMode,
      ).toBe('Challenge');
    });

    it('an auction without a Buy Now price can still be published and never offers it', async () => {
      const { seller, intakeId } = await passedIntake({ buyNowPrice: null });
      await publish(intakeId, seller).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      const pub = await call('get', `/auctions/${a._id}`).expect(200);
      expect(pub.body.auction).toMatchObject({ buyNowPrice: null, phase: 'Live' });
      await buyNowCmd(a._id, await actor()).expect(409);
    });

    it('the seller withdraws a scheduled auction and the book goes to reclaim', async () => {
      const { seller, intakeId } = await passedIntake();
      await publish(intakeId, seller, { startAt: later(HOUR) }).expect(200);
      await cmd(
        'post',
        `/auction-intakes/${intakeId}/cancel`,
        { expectedVersion: 4 },
        seller,
      ).expect(200);
      expect(await db.c.auction_intakes.findOne({ _id: intakeId })).toMatchObject({
        state: 'ReclaimRequired',
        reclaimReason: 'SellerCancelled',
      });
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
      fault: string | null = decision === 'RefundBuyer' ? 'BuyerDefault' : null,
    ) =>
      cmd(
        'post',
        `/operations/point-orders/${o.orderId}/resolve`,
        {
          expectedVersion: pending.version,
          decision,
          reason,
          ...(fault ? { fault } : {}),
        },
        a,
        key,
      );
    await resolve(staff, 'RefundBuyer').expect(403);
    await resolve(admin, 'RefundBuyer', 'ngắn').expect(422);
    // A missed collection is not a misdescription, and a refund needs a fault.
    await resolve(
      admin,
      'RefundBuyer',
      undefined,
      undefined,
      'BookMisdescribed',
    ).expect(422);
    await resolve(admin, 'RefundBuyer', undefined, undefined, null).expect(422);
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
      fault: 'BuyerDefault',
      adminId: admin.id,
    });
    // FR-AU08: a verified buyer default is recorded once.
    expect(
      await db.c.member_violations.find({ userId: o.winner.id }).toArray(),
    ).toMatchObject([{ kind: 'PointOrderBuyerDefault', sourceId: o.orderId }]);
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
        {
          expectedVersion: 3,
          decision: 'RefundBuyer',
          reason,
          fault: 'BookMisdescribed',
        },
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
      acceptedAt: null,
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

  it('FR-H09: an unanswered report is only refunded; a second missed collection reopens resolution', async () => {
    // POL-32: no answer means a safe cancel, never an acceptance for the buyer.
    const q = await paidOrder();
    await longSession(admin);
    const qp = (await db.c.point_orders.findOne({ _id: q.orderId }))!;
    pinClock(qp.acceptanceDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    pinClock(openAt(qp.acceptanceDeadline!));
    await resolveAs(admin, q.orderId, 3, 'ResumeCollection').expect(422);
    await resolveAs(
      admin,
      q.orderId,
      3,
      'RefundBuyer',
      undefined,
      'BookMisdescribed',
    ).expect(422);
    await resolveAs(
      admin,
      q.orderId,
      3,
      'RefundBuyer',
      undefined,
      'NoFault',
    ).expect(200);
    vi.restoreAllMocks();
    // No fault, no violation; the listing returns to sale after reclaim.
    expect(
      await db.c.member_violations.countDocuments({ userId: q.winner.id }),
    ).toBe(0);
    expect(
      await db.c.auction_intakes.findOne({ _id: q.intakeId }),
    ).toMatchObject({ reclaimReason: 'OrderCancelled' });

    // Accepted, then collection missed twice: deadline steps are keyed by
    // Order version, so the second is not a replay of the first.
    const o = await paidOrder();
    const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    const ready = await accepted(o, new Date(paid.paidAt!.getTime() + 60_000));
    pinClock(ready.collectionDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    const resumeAt = openAt(ready.collectionDeadline!);
    pinClock(resumeAt);
    await resolveAs(admin, o.orderId, 4, 'ResumeCollection').expect(200);
    vi.restoreAllMocks();
    const again = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
    expect(again).toMatchObject({
      state: 'ReadyForCollection',
      version: 5,
      acceptedAt: ready.acceptedAt,
      collectionOpenedAt: resumeAt,
    });
    pinClock(again.collectionDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: o.orderId })).toMatchObject({
      state: 'ResolutionPending',
      resolutionReason: 'CollectionOverdue',
      version: 6,
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
          check,
          note,
        },
        a,
        rkey,
      );
    let check = 'MatchesReport',
      note: string | null = 'Nhận lại đủ sách, tình trạng như lúc giao';
    await receive(otherStaff).expect(403);
    await receive(o.winner).expect(403);
    // SRS 9.3: the item is checked against the report before any refund.
    check = 'DoesNotMatch';
    note = 'ngắn';
    await receive(staff).expect(422);
    note = 'Không phải cuốn đã giao: khác ấn bản và không có dấu riêng';
    const refused = await receive(staff).expect(200);
    validates('AuctionCommandReceipt', refused.body);
    expect(refused.body).toMatchObject({
      returnOutcome: 'Refused',
      state: 'ReturnPending',
      version: 6,
    });
    expect(
      await db.c.ledger_journals.countDocuments({
        orderId: o.orderId,
        type: 'OrderRefund',
      }),
    ).toBe(0);
    check = 'MatchesReport';
    note = 'Nhận lại đủ sách, tình trạng như lúc giao';
    const before = (await call('get', '/me/wallet', o.winner).expect(200)).body;
    const rkey = randomUUID();
    const received = await receive(staff, rkey).expect(200);
    expect(received.body).toMatchObject({
      state: 'Cancelled',
      version: 7,
      returnOutcome: 'Accepted',
    });
    const again = await receive(staff, rkey).expect(200);
    expect(again.headers['idempotency-replayed']).toBe('true');
    vi.restoreAllMocks();
    const after = (await call('get', '/me/wallet', o.winner).expect(200)).body;
    expect(after.available - before.available).toBe(300_000);
    expect(after.transactionHeld).toBe(0);
    expect(
      await db.c.point_returns
        .find({ orderId: o.orderId }, { sort: { outcome: 1 } })
        .toArray(),
    ).toMatchObject([
      { outcome: 'Accepted', staffId: staff.id, returnedBy: o.winner.id },
      { outcome: 'Refused', journalId: null },
    ]);
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
    // An upheld claim sends the listing back to revision on reclaim.
    pinClock(new Date(returnAt.getTime() + 60_000));
    await cmd(
      'post',
      `/operations/auction-intakes/${o.intakeId}/reclaim`,
      { expectedVersion: intake.version },
      staff,
    ).expect(200);
    vi.restoreAllMocks();
    expect(await db.c.listings.findOne({ _id: o.listing.id })).toMatchObject({
      trade: 'Available',
      moderation: 'Draft',
    });
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

  it('FR-D01/02: a dismissed claim may be renewed for another Admin, then settles; a missed return reopens resolution', async () => {
    const o = await collectedOrder();
    await longSession(admin);
    const second = await actor(['ADMIN']);
    await longSession(second);
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
    expect(await db.c.point_orders.findOne({ _id: o.orderId })).toMatchObject({
      state: 'Inspection',
      version: 6,
      resolutionReason: null,
    });
    // The buyer may claim again inside the window (the appeal); the Admin
    // who dismissed the first claim may not decide it and does not see it.
    await orderPost(
      o.orderId,
      'claim',
      { expectedVersion: 6, description: claimText },
      o.winner,
    ).expect(200);
    const refused = await resolveAs(admin, o.orderId, 7, 'DismissClaim').expect(
      403,
    );
    expect(refused.body.code).toBe('SelfReviewForbidden');
    const queue = await call(
      'get',
      '/operations/point-order-resolutions',
      admin,
    ).expect(200);
    expect(queue.body.items.map((i: { id: string }) => i.id)).not.toContain(
      o.orderId,
    );
    await resolveAs(second, o.orderId, 7, 'DismissClaim').expect(200);
    vi.restoreAllMocks();
    expect(
      await db.c.point_order_claims.countDocuments({ orderId: o.orderId }),
    ).toBe(2);
    pinClock(c.inspectionDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(await db.c.point_orders.findOne({ _id: o.orderId })).toMatchObject({
      state: 'Completed',
      version: 9,
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
      { expectedVersion: 6, check: 'MatchesReport', note: null },
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

  it('FR-AU02: the seller withdraws an opened auction only before the first bid', async () => {
    const atB = { pointId: HANDOVER_POINT_B };
    const withdraw = async (
      o: Awaited<ReturnType<typeof openAuction>>,
      status: number,
    ) => {
      const i = (await db.c.auction_intakes.findOne({ _id: o.intakeId }))!;
      return cmd(
        'post',
        `/auction-intakes/${o.intakeId}/cancel`,
        { expectedVersion: i.version },
        o.seller,
      ).expect(status);
    };
    const free = await openAuction(atB);
    const done = await withdraw(free, 200);
    expect(done.body).toMatchObject({
      entityType: 'AuctionIntake',
      state: 'ReclaimRequired',
    });
    expect(await db.c.auctions.findOne({ _id: free.auctionId })).toMatchObject({
      state: 'Cancelled',
      bidderCount: 0,
    });
    expect(
      await db.c.auction_intakes.findOne({ _id: free.intakeId }),
    ).toMatchObject({ reclaimReason: 'SellerCancelled' });
    const contested = await openAuction(atB);
    await bid(contested.auctionId, await actor(), 200_000).expect(200);
    await withdraw(contested, 409);
    expect(
      await db.c.auctions.findOne({ _id: contested.auctionId }),
    ).toMatchObject({ state: 'Active' });
  });

  it('FR-AU08/POL-17: unpaid wins are recorded; three violations in 720 h restrict new auction activity for 168 h', async () => {
    const winner = await actor();
    const won = await wonAuction(winner);
    pinClock(won.doc.paymentDeadline!);
    await app.get(AuctionWorker).tick();
    vi.restoreAllMocks();
    expect(
      await db.c.member_violations.find({ userId: winner.id }).toArray(),
    ).toMatchObject([{ kind: 'AuctionNonPayment', sourceId: won.auctionId }]);
    // Seed earlier verified violations (test data, as the worker writes them).
    const seed = (userId: string, hoursAgo: number[]) =>
      db.c.member_violations.insertMany(
        hoursAgo.map((h) => ({
          _id: randomUUID(),
          userId,
          kind: 'AuctionNonPayment' as const,
          sourceId: randomUUID(),
          recordedAt: new Date(Date.now() - h * HOUR),
          receiptId: randomUUID(),
        })),
      );
    const restricted = await actor();
    await seed(restricted.id, [600, 300, 2]);
    const twice = await actor();
    await seed(twice.id, [300, 2]);
    // Three within 720 h, but the third was more than 168 h ago.
    const served = await actor();
    await seed(served.id, [800, 500, 200]);
    const target = await openAuction({ pointId: HANDOVER_POINT_B });
    const refused = await bid(target.auctionId, restricted, 200_000).expect(
      403,
    );
    expect(refused.body.code).toBe('AccountIneligible');
    await cmd(
      'post',
      `/auctions/${target.auctionId}/buy-now`,
      { fulfillmentMethod: 'SelfCollect' },
      restricted,
    ).expect(403);
    const listing = await saleListing(restricted);
    await cmd(
      'post',
      '/auction-intakes',
      intakeBody(listing, { pointId: HANDOVER_POINT_B }),
      restricted,
    ).expect(403);
    await bid(target.auctionId, twice, 200_000).expect(200);
    await bid(target.auctionId, served, 250_000).expect(200);
  });

  it('POL-41: an ended auction no longer counts for the seller; only live leads count for a bidder', async () => {
    // The seller's sold-but-unpaid auction has ended: two new intakes fit.
    const won = await wonAuction(await actor());
    const intake = (listing: { id: string; version: number }) =>
      cmd(
        'post',
        '/auction-intakes',
        intakeBody(listing, { pointId: HANDOVER_POINT_B }),
        won.seller,
      );
    await intake(await saleListing(won.seller)).expect(200);
    await intake(await saleListing(won.seller)).expect(200);
    await intake(await saleListing(won.seller)).expect(429);
    // A bidder leading five auctions cannot join a sixth; once outbid in one,
    // that commitment is released and the sixth is allowed.
    const bidder = await actor();
    const rival = await actor();
    const auctions = [];
    for (let i = 0; i < 6; i++)
      auctions.push(await openAuction({ pointId: HANDOVER_POINT_B }));
    for (const a of auctions.slice(0, 5))
      await bid(a.auctionId, bidder, 200_000).expect(200);
    const sixth = await bid(auctions[5].auctionId, bidder, 200_000).expect(429);
    expect(sixth.body.code).toBe('RATE_LIMITED');
    await bid(auctions[0].auctionId, rival, 250_000).expect(200);
    await bid(auctions[5].auctionId, bidder, 200_000).expect(200);
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
  it('ADR 0031: live watchers get committed public snapshots without ceilings', async () => {
    const opened = await openAuction();
    const id = opened.auctionId;
    const { port } = app.getHttpServer().address() as { port: number };
    const connect = () =>
      new Promise<Socket>((resolve, reject) => {
        const s = io(`http://127.0.0.1:${port}/auctions`, {
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
        });
        s.once('connect', () => resolve(s));
        s.once('connect_error', reject);
      });
    const waitFor = async (check: () => boolean, ms = 8000) => {
      const until = Date.now() + ms;
      while (!check()) {
        if (Date.now() > until) throw new Error('Timed out waiting for push');
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    const watcher = await connect();
    const lister = await connect();
    try {
      const updates: Array<{
        auction: { currentPrice: number | null; state: string };
      }> = [];
      const summaries: Array<{
        id: string;
        currentPrice: number | null;
        state: string;
      }> = [];
      watcher.on('auction:update', (u: (typeof updates)[number]) =>
        updates.push(u),
      );
      lister.on('auction:summary', (u: (typeof summaries)[number]) =>
        summaries.push(u),
      );

      // Invalid and unknown ids are refused; the ack carries the REST snapshot.
      expect(await watcher.emitWithAck('auction:watch', 'nope')).toMatchObject({
        ok: false,
      });
      expect(
        await watcher.emitWithAck('auction:watch', randomUUID()),
      ).toMatchObject({
        ok: false,
        code: 'NOT_FOUND',
      });
      const ack = await watcher.emitWithAck('auction:watch', id);
      expect(ack.ok).toBe(true);
      validates('PublicAuction', ack.auction);
      expect(await lister.emitWithAck('auctions:watch')).toEqual({ ok: true });

      // Commands through the API push at once; the Auto ceiling never travels.
      const first = await actor();
      const second = await actor();
      await auto(id, first, 500_000).expect(200);
      await waitFor(() =>
        updates.some((u) => u.auction.currentPrice === 200_000),
      );
      await bid(id, second, 300_000).expect(200);
      await waitFor(() =>
        updates.some((u) => u.auction.currentPrice === 350_000),
      );
      for (const u of updates) validates('PublicAuction', u);
      const wire = JSON.stringify([updates, summaries]);
      expect(wire).not.toContain('500000');
      expect(wire).not.toContain(first.id);
      expect(wire).not.toContain(second.id);
      await waitFor(() =>
        summaries.some((s) => s.id === id && s.currentPrice === 350_000),
      );
      for (const s of summaries) validates('PublicAuctionSummary', s);

      // The close runs in the worker, outside any request: the poll finds it.
      const doc = (await db.c.auctions.findOne({ _id: id }))!;
      pinClock(doc.endAt);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      await waitFor(() =>
        updates.some((u) => u.auction.state === 'AwaitingWinnerPayment'),
      );
      await waitFor(() =>
        summaries.some(
          (s) => s.id === id && s.state === 'AwaitingWinnerPayment',
        ),
      );

      expect(await watcher.emitWithAck('auction:unwatch', id)).toEqual({
        ok: true,
      });
      const before = updates.length;
      await cmd(
        'post',
        `/operations/auctions/${id}/cancel`,
        { reason: 'Kiểm thử kênh trực tiếp' },
        admin,
      );
      await new Promise((r) => setTimeout(r, 2500));
      expect(updates.length).toBe(before);
    } finally {
      watcher.disconnect();
      lister.disconnect();
    }
  });
  describe('concurrency and auction scope', () => {
    // ---- Concurrency: requests fired together over real HTTP; each auction is
    // serialized by its document lock, so every result must equal some serial order.
    // Invariants that must hold after any interleaving (FR-AU03–05).
    async function expectConsistent(auctionId: string) {
      const a = (await db.c.auctions.findOne({ _id: auctionId }))!;
      const bidders = await db.c.auction_bidders.find({ auctionId }).toArray();
      const top = [...bidders].sort(
        (x, y) => y.level - x.level || x.levelSequence - y.levelSequence,
      )[0]!;
      expect(a.leaderId).toBe(top.bidderId);
      expect(a.currentPrice!).toBeLessThanOrEqual(top.level);
      expect((a.currentPrice! - a.startPrice) % a.step).toBe(0);
      expect(a.bidderCount).toBe(bidders.length);
      const seqs = bidders.map((b) => b.levelSequence);
      expect(new Set(seqs).size).toBe(seqs.length);
      const pub = await call('get', `/auctions/${auctionId}`).expect(200);
      validates('PublicAuction', pub.body);
      const prices: number[] = pub.body.history.map(
        (h: { price: number }) => h.price,
      );
      expect(prices).toEqual([...prices].sort((p, q) => q - p));
      expect(prices[0]).toBe(a.currentPrice);
      return { a, bidders, pub: pub.body };
    }
    const buyNowCmd = (auctionId: string, a: Actor) =>
      cmd(
        'post',
        `/auctions/${auctionId}/buy-now`,
        { fulfillmentMethod: 'SelfCollect' },
        a,
      );

    it('race: two people press Bid together with different amounts; the higher one leads', async () => {
      for (let round = 0; round < 3; round++) {
        const { auctionId } = await openAuction();
        const [x, y] = [await actor(), await actor()];
        const [low, high] = await Promise.all([
          bid(auctionId, x, 300_000),
          bid(auctionId, y, 350_000),
        ]);
        expect(high.status).toBe(200);
        // Low committed first (both 200) or after high (BidTooLow); never both lost.
        if (low.status !== 200) expect(low.body.code).toBe('BidTooLow');
        const { a } = await expectConsistent(auctionId);
        expect(a).toMatchObject({
          leaderId: y.id,
          currentPrice: 350_000,
          bidderCount: low.status === 200 ? 2 : 1,
        });
      }
    });

    it('race: two people turn on Auto together; the order never changes the outcome', async () => {
      for (let round = 0; round < 3; round++) {
        // No Buy Now price: 600000 below must be a leaked ceiling, not the price.
        const { auctionId } = await openAuction({ buyNowPrice: null });
        const [x, y] = [await actor(), await actor()];
        const [rx, ry] = await Promise.all([
          auto(auctionId, x, 400_000),
          auto(auctionId, y, 600_000),
        ]);
        expect([rx.status, ry.status]).toEqual([200, 200]);
        const { a, pub } = await expectConsistent(auctionId);
        // Second price plus one step, capped at the winner's ceiling.
        expect(a).toMatchObject({ leaderId: y.id, currentPrice: 450_000 });
        expect(JSON.stringify(pub)).not.toContain('600000');
        const mine = await call(
          'get',
          `/me/auctions/${auctionId}/participation`,
          x,
        ).expect(200);
        expect(mine.body).toMatchObject({
          leading: false,
          ownLevel: 400_000,
          mode: 'Auto',
        });
      }
    });

    it('race: equal Auto ceilings together; whoever the server sequenced first keeps the lead', async () => {
      for (let round = 0; round < 3; round++) {
        const { auctionId } = await openAuction();
        const [x, y] = [await actor(), await actor()];
        const [rx, ry] = await Promise.all([
          auto(auctionId, x, 400_000),
          auto(auctionId, y, 400_000),
        ]);
        expect([rx.status, ry.status]).toEqual([200, 200]);
        const { a, bidders } = await expectConsistent(auctionId);
        const first = [...bidders].sort(
          (p, q) => p.levelSequence - q.levelSequence,
        )[0]!;
        expect(a).toMatchObject({
          leaderId: first.bidderId,
          currentPrice: 400_000,
        });
        // Each receipt reports the standing at its own commit, consistently.
        const byId: Record<string, { leading: boolean; currentPrice: number }> =
          {
            [x.id]: rx.body,
            [y.id]: ry.body,
          };
        expect(byId[first.bidderId]!.leading).toBe(true);
        expect(byId[first.bidderId === x.id ? y.id : x.id]).toMatchObject({
          leading: false,
          currentPrice: 400_000,
        });
      }
    });

    it('race: many Autos and bids at once converge to the proxy result', async () => {
      const { auctionId } = await openAuction();
      const people = await Promise.all(
        Array.from({ length: 8 }, () => actor()),
      );
      const plan: ['auto' | 'bid', number][] = [
        ['auto', 300_000],
        ['auto', 450_000],
        ['bid', 500_000],
        ['auto', 800_000],
        ['auto', 650_000],
        ['bid', 250_000],
        ['auto', 600_000],
        ['bid', 400_000],
      ];
      const results = await Promise.all(
        plan.map(([kind, amount], i) =>
          kind === 'auto'
            ? auto(auctionId, people[i]!, amount)
            : bid(auctionId, people[i]!, amount),
        ),
      );
      for (const r of results.filter((r) => r.status !== 200))
        expect(r.body.code).toBe('BidTooLow');
      const { a } = await expectConsistent(auctionId);
      // 800k always enters and always leads. 650k is refused if 600k and 800k
      // were sequenced first (price 650k, next bid 700k): the price is then 650k,
      // otherwise 650k enters and the price is 700k. Both are serial outcomes.
      expect(results[3]!.status).toBe(200);
      expect(a.leaderId).toBe(people[3]!.id);
      expect(a.currentPrice).toBe(
        results[4]!.status === 200 ? 700_000 : 650_000,
      );
      expect(a.bidCount).toBe(results.filter((r) => r.status === 200).length);
    });

    it('double click: the same Idempotency-Key sent three times at once commits one bid', async () => {
      const { auctionId } = await openAuction();
      const x = await actor();
      const key = randomUUID();
      const replies = await Promise.all([
        bid(auctionId, x, 300_000, key),
        bid(auctionId, x, 300_000, key),
        bid(auctionId, x, 300_000, key),
      ]);
      for (const r of replies) expect(r.status).toBe(200);
      expect(new Set(replies.map((r) => JSON.stringify(r.body))).size).toBe(1);
      expect(
        replies.filter((r) => r.headers['idempotency-replayed'] === 'false'),
      ).toHaveLength(1);
      expect(await db.c.auctions.findOne({ _id: auctionId })).toMatchObject({
        bidCount: 1,
        currentPrice: 300_000,
      });
      expect(
        await db.c.mutation_receipts.countDocuments({
          key,
          operation: 'placeAuctionBid',
        }),
      ).toBe(1);
    });

    it('double submit with two keys: the second request is refused, not a second bid', async () => {
      const { auctionId } = await openAuction();
      const x = await actor();
      const replies = await Promise.all([
        bid(auctionId, x, 300_000),
        bid(auctionId, x, 300_000),
      ]);
      expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await db.c.auctions.findOne({ _id: auctionId })).toMatchObject({
        bidCount: 1,
        leaderId: x.id,
      });
    });

    it('race: two Buy Now at once have one winner; Buy Now beats an Auto below its price', async () => {
      for (const rival of ['buy-now', 'auto'] as const) {
        const { auctionId } = await openAuction();
        const [x, y] = [await actor(), await actor()];
        const [r1, r2] = await Promise.all([
          buyNowCmd(auctionId, x),
          rival === 'auto'
            ? auto(auctionId, y, 400_000)
            : buyNowCmd(auctionId, y),
        ]);
        const a = (await db.c.auctions.findOne({ _id: auctionId }))!;
        const orders = await db.c.point_orders.countDocuments({ auctionId });
        // ADR 0043: Buy Now never forms an Order before the window closes.
        expect(orders).toBe(0);
        expect(a).toMatchObject({ state: 'Active', currentPrice: 600_000 });
        expect(a.buyNowAt).not.toBeNull();
        if (rival === 'buy-now') {
          // One Buy Now per auction; the one that committed leads.
          expect([r1.status, r2.status].sort()).toEqual([200, 409]);
          expect(a.leaderId).toBe(r1.status === 200 ? x.id : y.id);
        } else {
          // ADR 0047: an Auto that committed first does not withdraw Buy Now;
          // one that comes after it is below the new minimum.
          expect(r1.status).toBe(200);
          expect(a.leaderId).toBe(x.id);
          expect(a.bidderCount).toBe(r2.status === 200 ? 2 : 1);
        }
      }
    });

    it('race: disabling Auto while a rival bids ends in one of the two serial results', async () => {
      for (let round = 0; round < 3; round++) {
        const { auctionId } = await openAuction();
        const [x, y] = [await actor(), await actor()];
        await auto(auctionId, x, 500_000).expect(200);
        const [off, rb] = await Promise.all([
          cmd('post', `/auctions/${auctionId}/auto-bid/disable`, {}, x),
          bid(auctionId, y, 300_000),
        ]);
        expect(off.status).toBe(200);
        const { a } = await expectConsistent(auctionId);
        // Disable first: x stays at 200k manual and y leads at 300k.
        // Bid first: x's Auto answers 350k, then stops there, still leading.
        expect([
          { leaderId: y.id, currentPrice: 300_000 },
          { leaderId: x.id, currentPrice: 350_000 },
        ]).toContainEqual({
          leaderId: a.leaderId,
          currentPrice: a.currentPrice,
        });
        expect(rb.status).toBe(200);
      }
    });

    it('race: ten ascending manual bids at once keep a monotonic history', async () => {
      const { auctionId } = await openAuction();
      const people = await Promise.all(
        Array.from({ length: 10 }, () => actor()),
      );
      const results = await Promise.all(
        people.map((p, i) => bid(auctionId, p, 200_000 + i * 50_000)),
      );
      for (const r of results.filter((r) => r.status !== 200))
        expect(r.body.code).toBe('BidTooLow');
      expect(results[9]!.status).toBe(200);
      const { a, pub } = await expectConsistent(auctionId);
      expect(a).toMatchObject({
        leaderId: people[9]!.id,
        currentPrice: 650_000,
      });
      expect(pub.history).toHaveLength(
        results.filter((r) => r.status === 200).length,
      );
    });

    it('POL-41 race: bids fired at once in different auctions cannot exceed five live leads', async () => {
      const x = await actor();
      for (let i = 0; i < 4; i++) {
        const { auctionId } = await openAuction();
        await bid(auctionId, x, 200_000).expect(200);
      }
      const fresh = [
        await openAuction(),
        await openAuction(),
        await openAuction(),
      ];
      const replies = await Promise.all(
        fresh.map((f) => bid(f.auctionId, x, 200_000)),
      );
      expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
      for (const r of replies.filter((r) => r.status !== 200))
        expect(r.body.code).toBe('RATE_LIMITED');
      expect(
        await db.c.auctions.countDocuments({ leaderId: x.id, state: 'Active' }),
      ).toBe(5);
    });

    it('ADR 0067: bids pass the old 1,000,000 cap and the int32 range', async () => {
      const { auctionId } = await openAuction();
      const [x, y, z] = [await actor(), await actor(), await actor()];
      await auto(auctionId, x, 1_000_000).expect(200);
      const tie = await auto(auctionId, y, 1_000_000).expect(200);
      expect(tie.body).toMatchObject({
        currentPrice: 1_000_000,
        leading: false,
      });
      expect((await bid(auctionId, z, 1_000_000).expect(409)).body.code).toBe(
        'BidTooLow',
      );
      await bid(auctionId, z, 1_050_000).expect(200);
      // Above 2^31 − 1 the driver stores a double; migration 0054 accepts it.
      await bid(auctionId, x, 5_000_000_000).expect(200);
      const pub = await call('get', `/auctions/${auctionId}`).expect(200);
      expect(pub.body.auction.currentPrice).toBe(5_000_000_000);
      const { a } = await expectConsistent(auctionId);
      expect(a.leaderId).toBe(x.id);
    });

    it('an outbid bidder who matches the leading ceiling stays behind at that price', async () => {
      const { auctionId } = await openAuction();
      const [x, y] = [await actor(), await actor()];
      await auto(auctionId, x, 500_000).expect(200);
      await auto(auctionId, y, 400_000).expect(200);
      const matched = await auto(auctionId, y, 500_000).expect(200);
      expect(matched.body).toMatchObject({
        leading: false,
        currentPrice: 500_000,
      });
      const { a } = await expectConsistent(auctionId);
      expect(a.leaderId).toBe(x.id);
      // Lowering is never allowed, even for an outbid bidder.
      await auto(auctionId, y, 450_000).expect(409);
    });

    it('live: after a burst of simultaneous bids the last push equals the REST state', async () => {
      const { auctionId } = await openAuction();
      const { port } = app.getHttpServer().address() as { port: number };
      const watcher = await new Promise<Socket>((resolve, reject) => {
        const s = io(`http://127.0.0.1:${port}/auctions`, {
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
        });
        s.once('connect', () => resolve(s));
        s.once('connect_error', reject);
      });
      try {
        const updates: { auction: { currentPrice: number | null } }[] = [];
        watcher.on('auction:update', (u: (typeof updates)[number]) =>
          updates.push(u),
        );
        expect((await watcher.emitWithAck('auction:watch', auctionId)).ok).toBe(
          true,
        );
        const people = await Promise.all(
          Array.from({ length: 6 }, () => actor()),
        );
        await Promise.all(
          people.map((p, i) => bid(auctionId, p, 250_000 + i * 50_000)),
        );
        const rest = await call('get', `/auctions/${auctionId}`).expect(200);
        const until = Date.now() + 8000;
        const last = () => updates[updates.length - 1];
        while (
          last()?.auction.currentPrice !== rest.body.auction.currentPrice
        ) {
          if (Date.now() > until)
            throw new Error('Last push never reached the REST state');
          await new Promise((r) => setTimeout(r, 50));
        }
        await new Promise((r) => setTimeout(r, 2500)); // one more poll: nothing stale arrives later
        const { serverTime: _a, ...pushed } = last() as unknown as Record<
          string,
          unknown
        >;
        const { serverTime: _b, ...current } = (
          await call('get', `/auctions/${auctionId}`).expect(200)
        ).body;
        expect(pushed).toEqual(current);
      } finally {
        watcher.disconnect();
      }
    });

    it('FR-AU05: a leader who raised after winning a tie can still turn Auto off', async () => {
      const { auctionId } = await openAuction();
      const [x, y] = [await actor(), await actor()];
      await auto(auctionId, x, 400_000).expect(200);
      await auto(auctionId, y, 400_000).expect(200);
      await auto(auctionId, x, 600_000).expect(200);
      const off = await cmd(
        'post',
        `/auctions/${auctionId}/auto-bid/disable`,
        {},
        x,
      ).expect(200);
      expect(off.body).toMatchObject({ leading: true, currentPrice: 400_000 });
      const { a } = await expectConsistent(auctionId);
      expect(a.leaderId).toBe(x.id);
    });

    it('race: the seller withdrawing against the first bid has exactly one winner', async () => {
      for (let round = 0; round < 3; round++) {
        const o = await openAuction();
        const x = await actor();
        const i = (await db.c.auction_intakes.findOne({ _id: o.intakeId }))!;
        const [w, b] = await Promise.all([
          cmd(
            'post',
            `/auction-intakes/${o.intakeId}/cancel`,
            { expectedVersion: i.version },
            o.seller,
          ),
          bid(o.auctionId, x, 200_000),
        ]);
        expect([w.status, b.status].filter((s) => s === 200)).toHaveLength(1);
        const a = (await db.c.auctions.findOne({ _id: o.auctionId }))!;
        if (w.status === 200)
          expect(a).toMatchObject({ state: 'Cancelled', bidderCount: 0 });
        else
          expect(a).toMatchObject({
            state: 'Active',
            leaderId: x.id,
            bidderCount: 1,
          });
      }
    });

    it('ADR 0047: Buy Now stays after an Auto first bid and beats a lower ceiling', async () => {
      const { auctionId } = await openAuction();
      const [x, y] = [await actor(), await actor()];
      await auto(auctionId, x, 300_000).expect(200);
      const pub = await call('get', `/auctions/${auctionId}`).expect(200);
      expect(pub.body.auction.buyNowPrice).toBe(600_000);
      await buyNowCmd(auctionId, y).expect(200);
      const { a } = await expectConsistent(auctionId);
      expect(a).toMatchObject({ leaderId: y.id, currentPrice: 600_000 });
      // y did not lead when buying, so ADR 0070 gives the rivals 5 minutes.
      expect(a.endAt.getTime() - a.buyNowAt!.getTime()).toBe(300_000);
    });
  });
  describe('FR-AU09 holds and FR-N03 notifications', () => {
    type Note = {
      id: string;
      kind: string;
      title: string;
      body: string;
      targetId: string;
      readAt: string | null;
    };
    const inbox = async (a: Actor, query = '') => {
      const r = await call('get', `/me/notifications${query}`, a).expect(200);
      validates('MemberNotificationPage', r.body);
      return r.body as {
        items: Note[];
        unreadCount: number;
        nextCursor: string | null;
      };
    };
    const buyNowCmd = (auctionId: string, a: Actor) =>
      cmd(
        'post',
        `/auctions/${auctionId}/buy-now`,
        { fulfillmentMethod: 'SelfCollect' },
        a,
      );
    const kinds = async (a: Actor, auctionId: string) =>
      (await inbox(a, '?limit=50')).items
        .filter((n) => n.targetId === auctionId)
        .map((n) => n.kind)
        .sort();

    it('FR-AU09: a seller locked mid-auction holds it before the close; bids stop, nobody is promoted', async () => {
      const o = await openAuction();
      const [x, y] = [await actor(), await actor()];
      await auto(o.auctionId, x, 400_000).expect(200);
      await bid(o.auctionId, y, 300_000).expect(200);
      await db.setStatus(o.seller.id, 'LOCKED');
      await app.get(AuctionWorker).tick();
      const a = (await db.c.auctions.findOne({ _id: o.auctionId }))!;
      expect(a).toMatchObject({
        state: 'OnHold',
        leaderId: x.id,
        currentPrice: 350_000,
        winnerId: null,
      });
      expect(
        await db.c.auction_bidders.countDocuments({ auctionId: o.auctionId }),
      ).toBe(2);
      expect((await bid(o.auctionId, y, 450_000).expect(409)).body.code).toBe(
        'AuctionClosed',
      );
      // The close later skips it; only an independent Admin decides.
      pinClock(a.endAt);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect(await db.c.auctions.findOne({ _id: o.auctionId })).toMatchObject({
        state: 'OnHold',
        orderId: null,
      });
      // Seller (LOCKED, existing obligation) and leader are told. y never led:
      // their own bid's receipt already said "not leading", so no notice.
      expect(await kinds(o.seller, o.auctionId)).toEqual(['AuctionOnHold']);
      expect(await kinds(x, o.auctionId)).toEqual(['AuctionOnHold']);
      expect(await kinds(y, o.auctionId)).toEqual([]);
      const pub = await call('get', `/auctions/${o.auctionId}`).expect(200);
      expect(pub.body.auction).toMatchObject({
        state: 'OnHold',
        minimumBid: null,
      });
    });

    it('FR-AU09: a leader who loses eligibility is held too; an eligible auction is never held', async () => {
      const held = await openAuction();
      const calm = await openAuction();
      const [x, y] = [await actor(), await actor()];
      await bid(held.auctionId, x, 200_000).expect(200);
      await bid(calm.auctionId, y, 200_000).expect(200);
      await db.setStatus(x.id, 'RESTRICTED');
      await app.get(AuctionWorker).tick();
      await app.get(AuctionWorker).tick(); // holding is idempotent
      expect(
        (await db.c.auctions.findOne({ _id: held.auctionId }))!.state,
      ).toBe('OnHold');
      expect(
        (await db.c.auctions.findOne({ _id: calm.auctionId }))!.state,
      ).toBe('Active');
      expect(
        await db.c.member_notifications.countDocuments({
          targetId: held.auctionId,
          kind: 'AuctionOnHold',
        }),
      ).toBe(2);
    });

    it('FR-N03: outbid, won, sold and paid reach the right people once, without ceilings', async () => {
      const [x, y] = [await actor(), await actor()];
      const o = await openAuction();
      await auto(o.auctionId, x, 450_000).expect(200);
      const key = randomUUID();
      await bid(o.auctionId, y, 500_000, key).expect(200);
      await bid(o.auctionId, y, 500_000, key).expect(200); // replay: no second notice
      expect(await kinds(x, o.auctionId)).toEqual(['AuctionOutbid']);
      const outbid = (await inbox(x)).items.find(
        (n) => n.targetId === o.auctionId,
      )!;
      expect(outbid.body).toContain('500.000đ');
      expect(outbid.body).toContain('550.000đ');
      const doc = (await db.c.auctions.findOne({ _id: o.auctionId }))!;
      pinClock(doc.endAt);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect(await kinds(y, o.auctionId)).toEqual(['AuctionWon']);
      expect(await kinds(o.seller, o.auctionId)).toEqual(['AuctionSold']);
      const closed = (await db.c.auctions.findOne({ _id: o.auctionId }))!;
      await longSession(y);
      await fund(y, 500_000);
      pinClock(new Date(closed.closedAt!.getTime() + 60_000));
      await payOrder(closed.orderId!, y).expect(200);
      vi.restoreAllMocks();
      expect(await kinds(o.seller, o.auctionId)).toEqual([
        'AuctionPaid',
        'AuctionSold',
      ]);
      // A private ceiling never appears in anyone's inbox.
      const all = await db.c.member_notifications
        .find({ targetId: o.auctionId })
        .toArray();
      expect(JSON.stringify(all)).not.toContain('450.000');
      expect(
        all.every((n) => !n.body.includes(x.id) && !n.body.includes(y.id)),
      ).toBe(true);
    });

    it('FR-N03: Buy Now, unsold, Admin cancel and payment expiry notify seller and bidders', async () => {
      const [x, y] = [await actor(), await actor()];
      const bought = await openAuction();
      await buyNowCmd(bought.auctionId, x).expect(200);
      expect(await kinds(bought.seller, bought.auctionId)).toEqual([
        'AuctionBoughtNow',
      ]);
      expect(await kinds(x, bought.auctionId)).toEqual([]);

      const unsold = await openAuction();
      const end = (await db.c.auctions.findOne({ _id: unsold.auctionId }))!
        .endAt;
      pinClock(end);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect(await kinds(unsold.seller, unsold.auctionId)).toEqual([
        'AuctionUnsold',
      ]);

      const cancelled = await openAuction();
      await bid(cancelled.auctionId, x, 200_000).expect(200);
      await bid(cancelled.auctionId, y, 250_000).expect(200);
      const version = (await db.c.auctions.findOne({
        _id: cancelled.auctionId,
      }))!.version;
      await cmd(
        'post',
        `/operations/auctions/${cancelled.auctionId}/cancel`,
        {
          expectedVersion: version,
          reason: 'Nghi ngờ thông đồng giữa các tài khoản',
        },
        admin,
      ).expect(200);
      for (const who of [cancelled.seller, x, y])
        expect(await kinds(who, cancelled.auctionId)).toContain(
          'AuctionCancelled',
        );

      // ADR 0043: the window closes with the buyer as winner; unpaid after
      // 24 hours, buyer and seller are told.
      const deadline = (await closeAt(bought.auctionId)).paymentDeadline!;
      pinClock(deadline);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect(await kinds(x, bought.auctionId)).toEqual([
        'AuctionPaymentExpired',
        'AuctionWon',
      ]);
      expect(await kinds(bought.seller, bought.auctionId)).toEqual([
        'AuctionBoughtNow',
        'AuctionPaymentExpired',
        'AuctionSold',
      ]);
    });

    it('FR-N04: inbox pages, unread counts, marking read only touches own rows', async () => {
      const [x, other] = [await actor(), await actor()];
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const o = await openAuction();
        await bid(o.auctionId, x, 200_000).expect(200);
        await bid(o.auctionId, other, 250_000).expect(200);
        ids.push(o.auctionId);
      }
      const first = await inbox(x, '?limit=2');
      expect(first.items).toHaveLength(2);
      expect(first.unreadCount).toBe(3);
      const second = await inbox(x, `?limit=2&cursor=${first.nextCursor}`);
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.items, ...second.items].map((n) => n.targetId)),
      ).toEqual(new Set(ids));
      await call('get', '/me/notifications?cursor=nonsense', x).expect(400);

      // Another member's ids are ignored; the caller's own stay unread.
      const mine = first.items[0]!.id;
      const foreign = await call('post', '/me/notifications/read', other)
        .set('Idempotency-Key', randomUUID())
        .send({ ids: [mine] })
        .expect(200);
      validates('NotificationUnreadCount', foreign.body);
      expect((await inbox(x)).unreadCount).toBe(3);
      const one = await call('post', '/me/notifications/read', x)
        .set('Idempotency-Key', randomUUID())
        .send({ ids: [mine] })
        .expect(200);
      expect(one.body).toEqual({ unreadCount: 2 });
      await call('post', '/me/notifications/read', x)
        .set('Idempotency-Key', randomUUID())
        .send({ ids: [mine] })
        .expect(200); // idempotent
      await call('post', '/me/notifications/read', x)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(422);
      await call('post', '/me/notifications/read', x)
        .set('Idempotency-Key', randomUUID())
        .send({ ids: [mine], all: true })
        .expect(422);
      expect(
        (
          await call('post', '/me/notifications/read', x)
            .set('Idempotency-Key', randomUUID())
            .send({ all: true })
            .expect(200)
        ).body,
      ).toEqual({
        unreadCount: 0,
      });
      await call('get', '/me/notifications').expect(401);
      // Keyed like every mutation.
      await call('post', '/me/notifications/read', x)
        .send({ all: true })
        .expect(400);
    });
  });

  describe('ADR 0044: delivery from the point by the simulated carrier', () => {
    const FEE = 0;
    const addressInput = {
      recipientName: 'Người nhận kiểm thử',
      phone: '0900123456',
      serviceAreaCode: 'HCM-DEMO-v1',
      localityCode: 'DEMO-A',
      detail: 'Bàn demo riêng tư — không giao thật',
    };
    async function address(owner: Actor) {
      const book = (await call('get', '/me/addresses', owner).expect(200)).body;
      const saved = await cmd(
        'post',
        '/me/addresses',
        {
          expectedBookVersion: book.version,
          address: { ...addressInput, detail: `Địa chỉ demo ${randomUUID()}` },
          makeDefault: false,
        },
        owner,
      ).expect(200);
      return { id: saved.body.addressId as string, version: 1 };
    }
    const delivery = (a: { id: string; version: number }, fee = FEE) => ({
      fulfillmentMethod: 'CarrierOutbound',
      destinationAddressId: a.id,
      expectedDestinationAddressVersion: a.version,
      expectedOutboundFee: fee,
    });
    const dispatch = (orderId: string, s: Actor, version = 3, key?: string) =>
      cmd(
        'post',
        `/operations/point-orders/${orderId}/dispatch`,
        { expectedVersion: version },
        s,
        key,
      );
    const carrierEvent = (
      orderId: string,
      trackingCode: string,
      outcome: 'Delivered' | 'Failed',
      occurredAt: Date,
      by: Actor = operator,
      eventId = randomUUID(),
      key = eventId,
    ) =>
      cmd(
        'post',
        '/operations/simulator/point-delivery-events',
        {
          eventId,
          orderId,
          carrier: 'LatLaiSimulator',
          trackingCode,
          outcome,
          occurredAt: occurredAt.toISOString(),
        },
        by,
        key,
      );
    // A won auction paid with delivery on a pinned timeline (clock restored).
    async function deliveryOrder() {
      const winner = await actor();
      const won = await wonAuction(winner, 300_000);
      await fund(winner, 300_000 + FEE);
      const a = await address(winner);
      pinClock(won.payAt);
      await cmd(
        'post',
        `/point-orders/${won.orderId}/pay`,
        { expectedVersion: 1, ...delivery(a) },
        winner,
      ).expect(200);
      vi.restoreAllMocks();
      await longSession(staff);
      await longSession(won.seller);
      return { ...won, winner, address: a };
    }
    // Accepted report and Staff hand-off to the carrier (InTransit).
    async function inTransit() {
      const o = await deliveryOrder();
      const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
      const acceptAt = new Date(paid.paidAt!.getTime() + 60_000);
      await accepted(o, acceptAt);
      const at = openAt(acceptAt);
      pinClock(at);
      await dispatch(o.orderId, staff).expect(200);
      vi.restoreAllMocks();
      await longSession(operator);
      await longSession(admin);
      return {
        ...o,
        doc: (await db.c.point_orders.findOne({ _id: o.orderId }))!,
      };
    }

    it('quotes the fee and pays book price + fee once; bad choices are refused', async () => {
      const winner = await actor();
      const won = await wonAuction(winner, 300_000);
      await fund(winner, 400_000);
      const a = await address(winner);
      pinClock(won.payAt);
      const quote = await call(
        'get',
        `/me/point-orders/${won.orderId}/delivery-quote?addressId=${a.id}`,
        winner,
      ).expect(200);
      validates('PointOrderDeliveryQuote', quote.body);
      expect(quote.body).toMatchObject({
        addressVersion: 1,
        bookPrice: 300_000,
        outboundFee: FEE,
        buyerTotal: 300_000 + FEE,
      });
      // The seller cannot price the buyer's delivery.
      await longSession(won.seller);
      await call(
        'get',
        `/me/point-orders/${won.orderId}/delivery-quote?addressId=${a.id}`,
        won.seller,
      ).expect(404);
      const pay = (body: object, key?: string) =>
        cmd(
          'post',
          `/point-orders/${won.orderId}/pay`,
          { expectedVersion: 1, ...body },
          winner,
          key,
        );
      await pay({ fulfillmentMethod: 'CarrierOutbound' }).expect(422);
      await pay({ destinationAddressId: a.id }).expect(422);
      await pay(delivery(a, 30_000)).expect(409);
      await pay(delivery({ ...a, version: 2 })).expect(409);
      const outside = await address(winner);
      await db.c.member_addresses.updateOne(
        { _id: outside.id },
        { $set: { serviceAreaCode: 'OUTSIDE-v1' } },
      );
      try {
        await pay(delivery(outside)).expect(422);
      } finally {
        // Restore the deliberately invalid fixture before whole-DB integrity checks.
        await db.c.member_addresses.updateOne(
          { _id: outside.id },
          { $set: { serviceAreaCode: 'HCM-DEMO-v1' } },
        );
      }
      const other = await address(won.seller);
      await pay(delivery(other)).expect(404);
      expect(
        (await db.c.point_orders.findOne({ _id: won.orderId }))!.state,
      ).toBe('AwaitingPayment');

      const key = randomUUID();
      const paid = await pay(delivery(a), key).expect(200);
      validates('AuctionCommandReceipt', paid.body);
      expect(paid.body).toMatchObject({ state: 'Fulfilling' });
      const replay = await pay(delivery(a), key).expect(200);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      vi.restoreAllMocks();
      const o = (await db.c.point_orders.findOne({ _id: won.orderId }))!;
      expect(o).toMatchObject({
        fulfillmentMethod: 'CarrierOutbound',
        outboundFee: FEE,
        buyerTotal: 300_000 + FEE,
      });
      const w = await call('get', '/me/wallet', winner).expect(200);
      expect(w.body).toMatchObject({
        available: 400_000 - 300_000 - FEE,
        transactionHeld: 300_000 + FEE,
      });
      const buyerView = await call(
        'get',
        `/me/point-orders/${won.orderId}`,
        winner,
      ).expect(200);
      validates('PointOrder', buyerView.body);
      expect(buyerView.body).toMatchObject({
        fulfillmentMethod: 'CarrierOutbound',
        amounts: { outboundFee: FEE, buyerTotal: 300_000 + FEE },
        delivery: {
          recipientName: addressInput.recipientName,
          outboundFee: FEE,
          trackingCode: null,
        },
      });
      const sellerView = await call(
        'get',
        `/me/point-orders/${won.orderId}`,
        won.seller,
      ).expect(200);
      expect(sellerView.body.delivery).toBeNull();
      expect(JSON.stringify(sellerView.body)).not.toContain(addressInput.phone);
      expect(await reconciled()).toBe(true);
    });

    it('Staff hand the book to the carrier; Delivered starts inspection and the Order settles', async () => {
      const o = await deliveryOrder();
      const paid = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
      const acceptAt = new Date(paid.paidAt!.getTime() + 60_000);
      await accepted(o, acceptAt);
      const at = openAt(acceptAt);
      // No collection code and no counter handover for a delivery Order.
      pinClock(new Date(at.getTime() - 60_000));
      await orderPost(
        o.orderId,
        'collection-code',
        { expectedVersion: 3 },
        o.winner,
      ).expect(409);
      vi.restoreAllMocks();
      pinClock(at);
      await handover(o.orderId, '123456', staff).expect(409);
      // The Staff queue shows the label; another point's Staff cannot dispatch.
      const queue = await call('get', '/operations/point-orders', staff).expect(
        200,
      );
      validates('PointCollectionQueue', queue.body);
      expect(
        queue.body.items.find((i: { id: string }) => i.id === o.orderId),
      ).toMatchObject({
        fulfillmentMethod: 'CarrierOutbound',
        delivery: { phone: addressInput.phone, trackingCode: null },
      });
      await dispatch(o.orderId, otherStaff).expect(403);
      const key = randomUUID();
      const sent = await dispatch(o.orderId, staff, 3, key).expect(200);
      validates('AuctionCommandReceipt', sent.body);
      expect(sent.body).toMatchObject({ state: 'InTransit', version: 4 });
      const again = await dispatch(o.orderId, staff, 3, key).expect(200);
      expect(again.headers['idempotency-replayed']).toBe('true');
      await dispatch(o.orderId, staff, 4).expect(409);
      vi.restoreAllMocks();
      const moving = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
      expect(moving).toMatchObject({ state: 'InTransit', dispatchedAt: at });
      expect(moving.trackingCode).toMatch(/^LL-[A-Z0-9]{12}$/);
      expect(moving.deliveryDeadline!.getTime() - at.getTime()).toBe(
        240 * HOUR,
      );
      expect(
        await db.c.point_handovers.findOne({ orderId: o.orderId }),
      ).toMatchObject({ method: 'CarrierOutbound', codeId: null });

      await longSession(operator);
      const code = moving.trackingCode!;
      const deliveredAt = new Date(at.getTime() + 20 * HOUR);
      pinClock(new Date(deliveredAt.getTime() + 60_000));
      // Only an independent TEST_OPERATOR, with the key equal to the event id.
      await carrierEvent(
        o.orderId,
        code,
        'Delivered',
        deliveredAt,
        staff,
      ).expect(403);
      await carrierEvent(
        o.orderId,
        code,
        'Delivered',
        deliveredAt,
        operator,
        randomUUID(),
        randomUUID(),
      ).expect(422);
      await carrierEvent(
        o.orderId,
        'LL-NOTTHEORDER',
        'Delivered',
        deliveredAt,
      ).expect(404);
      await carrierEvent(
        o.orderId,
        code,
        'Delivered',
        new Date(at.getTime() - 1),
      ).expect(422);
      const eventId = randomUUID();
      const done = await carrierEvent(
        o.orderId,
        code,
        'Delivered',
        deliveredAt,
        operator,
        eventId,
      ).expect(200);
      expect(done.body).toMatchObject({ state: 'Inspection' });
      const replay = await carrierEvent(
        o.orderId,
        code,
        'Delivered',
        deliveredAt,
        operator,
        eventId,
      ).expect(200);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      await carrierEvent(o.orderId, code, 'Failed', deliveredAt).expect(409);
      vi.restoreAllMocks();
      const inspecting = (await db.c.point_orders.findOne({
        _id: o.orderId,
      }))!;
      expect(inspecting).toMatchObject({
        state: 'Inspection',
        collectedAt: deliveredAt,
      });
      expect(inspecting.inspectionDeadline!.getTime()).toBe(
        deliveredAt.getTime() + 72 * HOUR,
      );
      const view = await call(
        'get',
        `/me/point-orders/${o.orderId}`,
        o.winner,
      ).expect(200);
      validates('PointOrder', view.body);
      expect(view.body.delivery).toMatchObject({
        trackingCode: code,
        deliveredAt: deliveredAt.toISOString(),
      });

      // The unclaimed window settles once: seller P − C, platform C + fee.
      const sellerBefore = (
        await call('get', '/me/wallet', o.seller).expect(200)
      ).body.available;
      pinClock(inspecting.inspectionDeadline!);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect((await db.c.point_orders.findOne({ _id: o.orderId }))!.state).toBe(
        'Completed',
      );
      const settlement = (await db.c.ledger_journals.findOne({
        orderId: o.orderId,
        type: 'OrderSettlement',
      }))!;
      const entries = await db.c.ledger_entries
        .find({ journalId: settlement._id })
        .toArray();
      expect(
        entries.find((e) => e.accountId === PLATFORM_COMMISSION_ACCOUNT_ID),
      ).toMatchObject({ debit: 15_000 + FEE });
      expect(
        (await call('get', '/me/wallet', o.seller).expect(200)).body.available -
          sellerBefore,
      ).toBe(285_000);
      expect(
        (await call('get', '/me/wallet', o.winner).expect(200)).body
          .transactionHeld,
      ).toBe(0);
      expect(await reconciled()).toBe(true);
      // Full dispatch → delivery → inspection → settlement flow plus a
      // reconcile of all history retained so far, which grows through the file.
    }, 60000);

    it('a failed delivery can only be returned to the point, which refunds price and fee', async () => {
      const o = await inTransit();
      const failedAt = new Date(o.doc.dispatchedAt!.getTime() + 5 * HOUR);
      pinClock(new Date(failedAt.getTime() + 60_000));
      await carrierEvent(
        o.orderId,
        o.doc.trackingCode!,
        'Failed',
        failedAt,
      ).expect(200);
      vi.restoreAllMocks();
      expect(await db.c.point_orders.findOne({ _id: o.orderId })).toMatchObject(
        {
          state: 'ResolutionPending',
          resolutionReason: 'DeliveryFailed',
          collectedAt: null,
        },
      );
      const queue = await call(
        'get',
        '/operations/point-order-resolutions',
        admin,
      ).expect(200);
      validates('PointOrderResolutionQueue', queue.body);
      expect(
        queue.body.items.find((i: { id: string }) => i.id === o.orderId),
      ).toMatchObject({ openReason: 'DeliveryFailed' });
      // Decisions share the pinned timeline of the Order.
      pinClock(new Date(failedAt.getTime() + 2 * 60_000));
      await resolveAs(
        admin,
        o.orderId,
        5,
        'RefundBuyer',
        undefined,
        'NoFault',
      ).expect(422);
      await resolveAs(admin, o.orderId, 5, 'DismissClaim').expect(422);
      const required = await resolveAs(
        admin,
        o.orderId,
        5,
        'RequireReturn',
      ).expect(200);
      expect(required.body).toMatchObject({
        state: 'ReturnPending',
        version: 6,
      });
      vi.restoreAllMocks();
      const pending = (await db.c.point_orders.findOne({ _id: o.orderId }))!;
      pinClock(openAt(pending.updatedAt));
      const received = await cmd(
        'post',
        `/operations/point-orders/${o.orderId}/receive-return`,
        { expectedVersion: 6, check: 'MatchesReport', note: null },
        staff,
      ).expect(200);
      vi.restoreAllMocks();
      expect(received.body).toMatchObject({
        state: 'Cancelled',
        returnOutcome: 'Accepted',
      });
      const w = (await call('get', '/me/wallet', o.winner).expect(200)).body;
      expect(w).toMatchObject({
        available: 300_000 + FEE,
        transactionHeld: 0,
      });
      expect(
        (await db.c.auction_intakes.findOne({ _id: o.intakeId }))!.state,
      ).toBe('ReclaimRequired');
      expect(await reconciled()).toBe(true);
    });

    it('the operator lists in-transit deliveries without the address; others are refused', async () => {
      const o = await inTransit();
      const list = await call(
        'get',
        '/operations/simulator/point-deliveries',
        operator,
      ).expect(200);
      validates('SimulatedPointDeliveryQueue', list.body);
      const row = list.body.items.find(
        (i: { orderId: string }) => i.orderId === o.orderId,
      );
      expect(row).toMatchObject({
        trackingCode: o.doc.trackingCode,
        deliveryDeadline: o.doc.deliveryDeadline!.toISOString(),
      });
      expect(JSON.stringify(list.body)).not.toContain(addressInput.phone);
      await call('get', '/operations/simulator/point-deliveries', staff).expect(
        403,
      );
      await call(
        'get',
        '/operations/simulator/point-deliveries',
        o.winner,
      ).expect(403);
      // Delivered leaves the list.
      const at = new Date(o.doc.dispatchedAt!.getTime() + HOUR);
      pinClock(new Date(at.getTime() + 60_000));
      await carrierEvent(
        o.orderId,
        o.doc.trackingCode!,
        'Delivered',
        at,
      ).expect(200);
      vi.restoreAllMocks();
      const after = await call(
        'get',
        '/operations/simulator/point-deliveries',
        operator,
      ).expect(200);
      expect(
        after.body.items.some(
          (i: { orderId: string }) => i.orderId === o.orderId,
        ),
      ).toBe(false);
    });

    it('race: Delivered and Failed sent together have exactly one outcome', async () => {
      const o = await inTransit();
      const at = new Date(o.doc.dispatchedAt!.getTime() + 3 * HOUR);
      pinClock(new Date(at.getTime() + 60_000));
      const results = await Promise.all([
        carrierEvent(o.orderId, o.doc.trackingCode!, 'Delivered', at),
        carrierEvent(o.orderId, o.doc.trackingCode!, 'Failed', at),
      ]);
      vi.restoreAllMocks();
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const won = results.find((r) => r.status === 200)!.body.state;
      expect(['Inspection', 'ResolutionPending']).toContain(won);
      expect(
        await db.c.point_carrier_events.countDocuments({ orderId: o.orderId }),
      ).toBe(1);
      expect((await db.c.point_orders.findOne({ _id: o.orderId }))!.state).toBe(
        won,
      );
    });

    it('no carrier outcome in time, or a missed hand-off, is never the buyer default', async () => {
      const late = await inTransit();
      pinClock(late.doc.deliveryDeadline!);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect(
        await db.c.point_orders.findOne({ _id: late.orderId }),
      ).toMatchObject({
        state: 'ResolutionPending',
        resolutionReason: 'DeliveryFailed',
      });

      const missed = await deliveryOrder();
      const paid = (await db.c.point_orders.findOne({
        _id: missed.orderId,
      }))!;
      const ready = await accepted(
        missed,
        new Date(paid.paidAt!.getTime() + 60_000),
      );
      pinClock(ready.collectionDeadline!);
      await dispatch(missed.orderId, staff).expect(409);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect(
        await db.c.point_orders.findOne({ _id: missed.orderId }),
      ).toMatchObject({
        state: 'ResolutionPending',
        resolutionReason: 'CollectionOverdue',
      });
      await longSession(admin);
      pinClock(new Date(ready.collectionDeadline!.getTime() + 60_000));
      await resolveAs(
        admin,
        missed.orderId,
        4,
        'RefundBuyer',
        undefined,
        'BuyerDefault',
      ).expect(422);
      await resolveAs(
        admin,
        missed.orderId,
        4,
        'RefundBuyer',
        undefined,
        'NoFault',
      ).expect(200);
      vi.restoreAllMocks();
      expect(
        await db.c.member_violations.countDocuments({
          userId: missed.winner.id,
        }),
      ).toBe(0);
      expect(
        (await call('get', '/me/wallet', missed.winner).expect(200)).body
          .available,
      ).toBe(300_000 + FEE);
      expect(await reconciled()).toBe(true);
    });
  });

  // ADR 0076: Dutch and sealed-bid formats (with ADR 0075 holds switched on).
  describe('ADR 0076: auction formats', () => {
    const toggle = (on: boolean) => {
      (app.get(AuctionBiddingService) as unknown as { fundsCheck: boolean }).fundsCheck = on;
    };
    beforeAll(() => toggle(true));
    afterAll(() => toggle(false));
    const accept = (auctionId: string, a: Actor, price: number) =>
      cmd('post', `/auctions/${auctionId}/dutch-accept`, { price, fulfillmentMethod: 'SelfCollect' }, a);
    const sealed = (auctionId: string, a: Actor, amount: number) =>
      cmd('post', `/auctions/${auctionId}/sealed-bid`, { amount, fulfillmentMethod: 'SelfCollect' }, a);
    const buyNowCmd = (auctionId: string, a: Actor) =>
      cmd('post', `/auctions/${auctionId}/buy-now`, { fulfillmentMethod: 'SelfCollect' }, a);
    const heldOf = async (a: Actor) =>
      (await call('get', '/me/wallet', a).expect(200)).body.auctionHeld as number;
    const liveOf = async (over: Parameters<typeof intakeBody>[1]) => {
      const { seller, intakeId } = await passedIntake(over);
      await publish(intakeId, seller).expect(200);
      return (await db.c.auctions.findOne({ intakeId }))!;
    };
    const dutchOver = {
      auctionType: 'Dutch' as const,
      startPrice: 200_000,
      step: 50_000,
      buyNowPrice: null,
      dutchTopPrice: 400_000,
      dutchIntervalSeconds: 60,
    };

    it('Dutch: the price falls on schedule; the first acceptance wins now and closes', async () => {
      const a = await liveOf(dutchOver);
      expect(a).toMatchObject({ auctionType: 'Dutch', buyNowMode: 'Instant', startPrice: 200_000, dutchTopPrice: 400_000 });
      const pub = await call('get', `/auctions/${a._id}`).expect(200);
      validates('PublicAuction', pub.body);
      expect(pub.body.auction).toMatchObject({ auctionType: 'Dutch', dutchPrice: 400_000, minimumBid: null, buyNowPrice: null });
      const [x, y] = [await actor(), await actor()];
      await fund(x, 300_000);
      await fund(y, 400_000);
      // English commands are refused for a Dutch auction.
      expect((await bid(a._id, x, 400_000).expect(409)).body.code).toBe('InvalidState');
      expect((await auto(a._id, x, 400_000).expect(409)).body.code).toBe('InvalidState');
      expect((await buyNowCmd(a._id, x).expect(409)).body.code).toBe('InvalidState');
      // Two drops after 125 s on the decision clock: 400,000 → 300,000.
      pinClock(new Date(a.startAt.getTime() + 125_000));
      // Accepting a lower price than the server price is refused.
      const low = await accept(a._id, x, 250_000).expect(409);
      expect(low.body.message).toContain('300.000đ');
      const won = await accept(a._id, x, 300_000).expect(200);
      validates('AuctionCommandReceipt', won.body);
      // Same instant: the auction already ended for everyone else.
      expect((await accept(a._id, y, 400_000).expect(409)).body.code).toBe('AuctionClosed');
      vi.restoreAllMocks();
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(after).toMatchObject({ leaderId: x.id, currentPrice: 300_000, bidderCount: 1 });
      expect(after.endAt).toEqual(after.buyNowAt);
      expect(await heldOf(x)).toBe(300_000);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: x.id, finalPrice: 300_000 });
      expect(await heldOf(x)).toBe(300_000);
      expect(await reconciled()).toBe(true);
    });

    it('Dutch: nobody accepts by the end, so it closes Unsold at the floor', async () => {
      const a = await liveOf(dutchOver);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ state: 'Unsold', bidderCount: 0 });
    });

    it('Dutch: unfunded acceptance is refused; race of two acceptances has one winner', async () => {
      const a = await liveOf(dutchOver);
      const poor = await actor();
      expect((await accept(a._id, poor, 400_000).expect(409)).body.code).toBe('InvalidState');
      const [x, y] = [await actor(), await actor()];
      await fund(x, 400_000);
      await fund(y, 400_000);
      const results = await Promise.all([accept(a._id, x, 400_000), accept(a._id, y, 400_000)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(after.bidderCount).toBe(1);
      expect((await heldOf(x)) + (await heldOf(y))).toBe(400_000);
      expect(await reconciled()).toBe(true);
    });

    it('format validation: Dutch needs a schedule above the floor and no Buy Now', async () => {
      const seller = await actor();
      const l = await saleListing(seller);
      const post = (over: Parameters<typeof intakeBody>[1]) =>
        cmd('post', '/auction-intakes', intakeBody(l, over), seller);
      const field = async (over: Parameters<typeof intakeBody>[1]) =>
        JSON.stringify((await post(over).expect(422)).body);
      expect(await field({ ...dutchOver, buyNowPrice: 600_000 })).toContain('buyNowPrice');
      expect(await field({ ...dutchOver, dutchTopPrice: 200_000 })).toContain('dutchTopPrice');
      expect(await field({ ...dutchOver, dutchTopPrice: 420_000 })).toContain('dutchTopPrice');
      // Below the contract minimum: refused by request validation.
      expect((await post({ ...dutchOver, dutchIntervalSeconds: 5 }).expect(422)).body.code).toBe('VALIDATION_ERROR');
      expect(await field({ auctionType: 'SealedFirst' })).toContain('buyNowPrice');
      expect(await field({ dutchTopPrice: 400_000, dutchIntervalSeconds: 60 })).toContain('auctionType');
    });

    it('sealed first price: bids stay hidden; highest wins and pays it; losers are refunded', async () => {
      const a = await liveOf({ auctionType: 'SealedFirst', buyNowPrice: null });
      const [x, y, z] = [await actor(), await actor(), await actor()];
      for (const m of [x, y, z]) await fund(m, 500_000);
      const rx = await sealed(a._id, x, 300_000).expect(200);
      expect(rx.body).toMatchObject({ currentPrice: null, leading: null, minimumBid: 200_000 });
      await sealed(a._id, y, 250_000).expect(200);
      await sealed(a._id, z, 300_000).expect(200); // tie: x was first
      // Nothing reveals who leads or at what price.
      const pub = await call('get', `/auctions/${a._id}`).expect(200);
      validates('PublicAuction', pub.body);
      expect(pub.body).toMatchObject({ leaderAlias: null, history: [] });
      expect(pub.body.auction).toMatchObject({ currentPrice: null, minimumBid: 200_000, bidderCount: 3 });
      const own = await call('get', `/me/auctions/${a._id}/participation`, y).expect(200);
      expect(own.body).toMatchObject({ leading: false, currentPrice: null, ownLevel: 250_000, heldAmount: 250_000 });
      expect(await db.c.member_notifications.countDocuments({ targetId: a._id, kind: 'AuctionOutbid' })).toBe(0);
      // Each bidder's whole bid is held.
      expect([await heldOf(x), await heldOf(y), await heldOf(z)]).toEqual([300_000, 250_000, 300_000]);
      // Raise only; English commands refused.
      expect((await sealed(a._id, z, 300_000).expect(409)).body.code).toBe('InvalidState');
      expect((await bid(a._id, z, 400_000).expect(409)).body.code).toBe('InvalidState');
      expect((await sealed(a._id, z, 330_000).expect(422)).body.code).toBe('VALIDATION_ERROR');
      await sealed(a._id, z, 350_000).expect(200);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: z.id, finalPrice: 350_000 });
      expect([await heldOf(x), await heldOf(y), await heldOf(z)]).toEqual([0, 0, 350_000]);
      // After the close the history and winner may be shown.
      const ended = await call('get', `/auctions/${a._id}`).expect(200);
      expect(ended.body.auction.currentPrice).toBe(350_000);
      expect(await reconciled()).toBe(true);
    });

    it('sealed second price: the winner pays the second bid, or the start price alone', async () => {
      const a = await liveOf({ auctionType: 'SealedSecond', buyNowPrice: null });
      const [x, y] = [await actor(), await actor()];
      await fund(x, 500_000);
      await fund(y, 500_000);
      await sealed(a._id, x, 400_000).expect(200);
      await sealed(a._id, y, 300_000).expect(200);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ winnerId: x.id, finalPrice: 300_000 });
      // x held 400,000 and gets 100,000 back; y gets everything back.
      expect([await heldOf(x), await heldOf(y)]).toEqual([300_000, 0]);

      const solo = await liveOf({ auctionType: 'SealedSecond', buyNowPrice: null });
      const z = await actor();
      await fund(z, 500_000);
      await sealed(solo._id, z, 450_000).expect(200);
      expect(await closeAt(solo._id)).toMatchObject({ winnerId: z.id, finalPrice: 200_000 });
      expect(await heldOf(z)).toBe(200_000);
      expect(await reconciled()).toBe(true);
    });

    it('sealed: Dutch acceptance is refused and an English auction refuses sealed bids', async () => {
      const s1 = await liveOf({ auctionType: 'SealedFirst', buyNowPrice: null });
      const e1 = await liveOf({});
      const x = await actor();
      await fund(x, 500_000);
      expect((await accept(s1._id, x, 300_000).expect(409)).body.code).toBe('InvalidState');
      expect((await sealed(e1._id, x, 300_000).expect(409)).body.code).toBe('InvalidState');
    });
  });
  // ADR 0071: bids, Auto ceilings and Buy Now need available balance for the
  // commitment plus open ones. Historical suites run with the check off
  // (test-env.ts); this block switches it on for the real service.
  describe('ADR 0071: wallet balance check on bidding', () => {
    const toggle = (on: boolean) => {
      (app.get(AuctionBiddingService) as unknown as { fundsCheck: boolean }).fundsCheck = on;
    };
    beforeAll(() => toggle(true));
    afterAll(() => toggle(false));
    const buyNowCmd = (auctionId: string, a: Actor) =>
      cmd('post', `/auctions/${auctionId}/buy-now`, { fulfillmentMethod: 'SelfCollect' }, a);
    const live = async () => {
      const { seller, intakeId } = await passedIntake();
      await publish(intakeId, seller).expect(200);
      return (await db.c.auctions.findOne({ intakeId }))!;
    };

    it('an unfunded bid is refused without a bid row; a funded one is accepted', async () => {
      const a = await live();
      const x = await actor();
      const refused = await bid(a._id, x, 300_000).expect(409);
      expect(refused.body.code).toBe('InvalidState');
      expect(refused.body.message).toMatch(/Số dư khả dụng 0đ chưa đủ/);
      expect(await db.c.auction_bids.countDocuments({ auctionId: a._id })).toBe(0);
      await fund(x, 300_000);
      await bid(a._id, x, 300_000).expect(200);
    });

    it('an Auto ceiling must be covered in full; Buy Now needs its price', async () => {
      const a = await live();
      const x = await actor();
      await fund(x, 400_000);
      expect((await auto(a._id, x, 500_000).expect(409)).body.code).toBe('InvalidState');
      await auto(a._id, x, 400_000).expect(200);
      const y = await actor();
      await fund(y, 500_000);
      expect((await buyNowCmd(a._id, y).expect(409)).body.code).toBe('InvalidState');
      await fund(y, 100_000);
      await buyNowCmd(a._id, y).expect(200);
    });

    it('the price a bidder leads at elsewhere counts as committed', async () => {
      const [first, second] = [await live(), await live()];
      const x = await actor();
      await fund(x, 500_000);
      await bid(first._id, x, 300_000).expect(200);
      const refused = await bid(second._id, x, 300_000).expect(409);
      // ADR 0075: the first lead is held, so it shows as held, not "open".
      expect(refused.body.message).toMatch(/đang được giữ 300\.000đ/);
      await fund(x, 100_000);
      await bid(second._id, x, 300_000).expect(200);
    });

    // ADR 0075: the leader's level is held in the wallet and released when
    // outbid, cancelled, expired, closed above the final price, or paid.
    const wallet = async (a: Actor) =>
      (await call('get', '/me/wallet', a).expect(200)).body as {
        available: number;
        auctionHeld: number;
        total: number;
      };
    const heldFor = async (auctionId: string, a: Actor) =>
      (await call('get', `/me/auctions/${auctionId}/participation`, a).expect(200))
        .body.heldAmount as number;
    const kinds = async (a: Actor, auctionId: string) =>
      (
        await db.c.member_notifications
          .find({ userId: a.id, targetId: auctionId })
          .sort({ createdAt: 1 })
          .toArray()
      ).map((n) => n.kind);

    it('ADR 0075: the leader is held; an outbid leader gets the money back at once', async () => {
      const a = await live();
      const [x, y] = [await actor(), await actor()];
      await fund(x, 500_000);
      await fund(y, 500_000);
      await bid(a._id, x, 300_000).expect(200);
      expect(await wallet(x)).toMatchObject({ available: 200_000, auctionHeld: 300_000, total: 500_000 });
      expect(await heldFor(a._id, x)).toBe(300_000);
      await bid(a._id, y, 350_000).expect(200);
      expect(await wallet(x)).toMatchObject({ available: 500_000, auctionHeld: 0 });
      expect(await heldFor(a._id, x)).toBe(0);
      expect(await wallet(y)).toMatchObject({ available: 150_000, auctionHeld: 350_000 });
      expect((await kinds(x, a._id)).sort()).toEqual(['AuctionFundsHeld', 'AuctionFundsReleased', 'AuctionOutbid']);
      const released = await db.c.member_notifications.findOne({ userId: x.id, kind: 'AuctionFundsReleased' });
      expect(released!.body).toContain('300.000đ');
      // The rival never sees x's amounts.
      expect(JSON.stringify(await db.c.member_notifications.find({ userId: y.id }).toArray())).not.toContain('300.000đ đã về');
      expect(await reconciled()).toBe(true);
    });

    it('ADR 0075: an Auto ceiling is held in full and Auto off lowers it to the price', async () => {
      const a = await live();
      const [x, y] = [await actor(), await actor()];
      await fund(x, 500_000);
      await fund(y, 300_000);
      await auto(a._id, x, 500_000).expect(200);
      expect(await heldFor(a._id, x)).toBe(500_000);
      // A rival below the ceiling moves the price, not x's hold.
      await bid(a._id, y, 300_000).expect(200);
      expect((await db.c.auctions.findOne({ _id: a._id }))!).toMatchObject({ leaderId: x.id, currentPrice: 350_000 });
      expect(await heldFor(a._id, x)).toBe(500_000);
      expect(await wallet(y)).toMatchObject({ available: 300_000, auctionHeld: 0 });
      await cmd('post', `/auctions/${a._id}/auto-bid/disable`, {}, x).expect(200);
      expect(await heldFor(a._id, x)).toBe(350_000);
      expect(await wallet(x)).toMatchObject({ available: 150_000, auctionHeld: 350_000 });
      expect(await reconciled()).toBe(true);
    });

    it('ADR 0075: held money cannot be bid again elsewhere; a retried key holds once', async () => {
      const [first, second] = [await live(), await live()];
      const x = await actor();
      await fund(x, 400_000);
      const key = randomUUID();
      await bid(first._id, x, 300_000, key).expect(200);
      const replay = await bid(first._id, x, 300_000, key).expect(200);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(await wallet(x)).toMatchObject({ available: 100_000, auctionHeld: 300_000 });
      expect(await db.c.ledger_journals.countDocuments({ auctionId: first._id, type: 'AuctionBidHold' })).toBe(1);
      expect((await bid(second._id, x, 200_000).expect(409)).body.code).toBe('InvalidState');
      expect(await db.c.auction_bids.countDocuments({ auctionId: second._id })).toBe(0);
    });

    it('ADR 0075: close keeps the final price for the winner; payment uses the hold once', async () => {
      const a = await live();
      const [x, y] = [await actor(), await actor()];
      await fund(x, 500_000);
      await fund(y, 300_000);
      await auto(a._id, x, 500_000).expect(200);
      await bid(a._id, y, 300_000).expect(200);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: x.id, finalPrice: 350_000 });
      expect(await wallet(x)).toMatchObject({ available: 150_000, auctionHeld: 350_000, total: 500_000 });
      expect(await kinds(x, a._id)).toContain('AuctionFundsReleased');
      await longSession(x);
      pinClock(new Date(closed.closedAt!.getTime() + 60_000));
      await payOrder(closed.orderId!, x).expect(200);
      vi.restoreAllMocks();
      // 350,000 moved from the hold into the Order hold: nothing charged twice.
      expect(await wallet(x)).toMatchObject({ available: 150_000, auctionHeld: 0 });
      expect(await reconciled()).toBe(true);
    });

    it('ADR 0075: payment expiry and Admin cancel give the money back', async () => {
      const a = await live();
      const x = await actor();
      await fund(x, 300_000);
      await bid(a._id, x, 300_000).expect(200);
      const closed = await closeAt(a._id);
      expect(await wallet(x)).toMatchObject({ available: 0, auctionHeld: 300_000 });
      pinClock(new Date(closed.paymentDeadline!.getTime() + 1_000));
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect((await db.c.auctions.findOne({ _id: a._id }))!.state).toBe('PaymentExpired');
      expect(await wallet(x)).toMatchObject({ available: 300_000, auctionHeld: 0 });

      const b = await live();
      const y = await actor();
      await fund(y, 300_000);
      await bid(b._id, y, 250_000).expect(200);
      const v = (await db.c.auctions.findOne({ _id: b._id }))!.version;
      await cmd(
        'post',
        `/operations/auctions/${b._id}/cancel`,
        { expectedVersion: v, reason: 'Nghi ngờ gian lận trong phiên' },
        admin,
      ).expect(200);
      expect(await wallet(y)).toMatchObject({ available: 300_000, auctionHeld: 0 });
      expect(await kinds(y, b._id)).toContain('AuctionFundsReleased');
      expect(await reconciled()).toBe(true);
    });

    it('ADR 0075 race: simultaneous bids end with exactly the leader held', async () => {
      const a = await live();
      const bidders = await Promise.all([actor(), actor(), actor(), actor()]);
      for (const b of bidders) await fund(b, 1_000_000);
      await Promise.all(bidders.map((b, i) => bid(a._id, b, 300_000 + i * 50_000)));
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      // Refused bidders have no participation row; the wallet shows 0 held.
      const held = await Promise.all(bidders.map(async (b) => (await wallet(b)).auctionHeld));
      const leaderIndex = bidders.findIndex((b) => b.id === after.leaderId);
      const leaderLevel = (await db.c.auction_bidders.findOne({ _id: `${a._id}:${after.leaderId}` }))!.level;
      held.forEach((h, i) => expect(h).toBe(i === leaderIndex ? leaderLevel : 0));
      expect(await reconciled()).toBe(true);
    });

    it('disabling Auto never needs funds', async () => {
      const a = await live();
      const x = await actor();
      await fund(x, 300_000);
      await auto(a._id, x, 300_000).expect(200);
      await cmd('post', `/auctions/${a._id}/auto-bid/disable`, {}, x).expect(200);
    });
  });

  // ADR 0077: registration with a refundable deposit (holds and registration on).
  describe('ADR 0077: bidder registration and deposits', () => {
    const toggle = (on: boolean) => {
      (app.get(AuctionBiddingService) as unknown as { fundsCheck: boolean }).fundsCheck = on;
      (app.get(AuctionIntakesService) as unknown as { registration: boolean }).registration = on;
    };
    beforeAll(() => toggle(true));
    afterAll(() => toggle(false));
    const DEPOSIT = 20_000; // 10% of the 200,000 start price
    const register = (auctionId: string, a: Actor, deposit = DEPOSIT, key?: string) =>
      cmd('post', `/auctions/${auctionId}/registration`, { deposit }, a, key);
    const withdraw = (auctionId: string, a: Actor) =>
      cmd('post', `/auctions/${auctionId}/registration/withdraw`, {}, a);
    const wallet = async (a: Actor) =>
      (await call('get', '/me/wallet', a).expect(200)).body as { available: number; auctionHeld: number };
    const kinds = async (a: Actor, auctionId: string) =>
      (await db.c.member_notifications.find({ userId: a.id, targetId: auctionId }).toArray()).map((n) => n.kind).sort();
    const regState = async (auctionId: string, a: Actor) =>
      (await db.c.auction_registrations.findOne({ _id: `${auctionId}:${a.id}` }))?.state;
    const platform = () =>
      app.get(MongoService).tx((tx) => app.get(LedgerService).balance(tx, PLATFORM_COMMISSION_ACCOUNT_ID));
    // ADR 0081: the seller always picks an open time, at least 5 minutes
    // ahead. Without a time in publishBody the test starts where waiting
    // leads: the open time passed with too few registrants (fixture: opensAt
    // moved back to publishedAt, deadline 24 h later), so reaching the
    // minimum opens it at once.
    const liveOf = async (
      over: Parameters<typeof intakeBody>[1] & { minBidders?: number } = {},
      publishBody: Parameters<typeof publish>[2] = {},
    ) => {
      const { seller, intakeId } = await passedIntake(over);
      const timed = publishBody.startAt !== undefined;
      await publish(
        intakeId,
        seller,
        timed ? publishBody : { ...publishBody, startAt: new Date(Date.now() + 10 * 60_000).toISOString() },
      ).expect(200);
      const a = (await db.c.auctions.findOne({ intakeId }))!;
      if (timed) return { seller, a };
      const length = a.plannedEndAt.getTime() - a.startAt.getTime();
      const startAt = new Date(a.publishedAt.getTime() + 24 * 3_600_000);
      const end = new Date(startAt.getTime() + length);
      await db.c.auctions.updateOne(
        { _id: a._id },
        { $set: { opensAt: a.publishedAt, startAt, plannedEndAt: end, endAt: end } },
      );
      return { seller, a: (await db.c.auctions.findOne({ intakeId }))! };
    };
    const funded = async (amount: number) => {
      const x = await actor();
      await fund(x, amount);
      return x;
    };
    const doc = async (auctionId: string) => (await db.c.auctions.findOne({ _id: auctionId }))!;
    // ADR 0079: the minimum is at least 4. Registers `members`, then funded
    // fillers until the minimum is reached (the gate).
    const fill = async (auctionId: string, ...members: Actor[]) => {
      for (const m of members) await register(auctionId, m).expect(200);
      const a = await doc(auctionId);
      const extra: Actor[] = [];
      for (let i = a.registeredCount; i < a.minBidders!; i++) {
        const f = await funded(100_000);
        await register(auctionId, f).expect(200);
        extra.push(f);
      }
      return extra;
    };

    it('publishes with the seller minimum and the 10% deposit; bidding opens at the minimum', async () => {
      const { seller, a } = await liveOf({ minBidders: 5 });
      expect(a).toMatchObject({ minBidders: 5, depositAmount: DEPOSIT, registeredCount: 0, closeReason: null, openMode: 'ScheduledGrace' });
      const pub = await call('get', `/auctions/${a._id}`).expect(200);
      validates('PublicAuction', pub.body);
      expect(pub.body.auction).toMatchObject({ minBidders: 5, depositAmount: DEPOSIT, registeredCount: 0, openMode: 'ScheduledGrace', opensAt: a.opensAt!.toISOString(), phase: 'Scheduled' });
      const [x, y, z] = [await funded(500_000), await funded(500_000), await funded(500_000)];
      // Waiting for registrants: no bid before the auction opens.
      expect((await bid(a._id, x, 200_000).expect(409)).body.code).toBe('AuctionNotStarted');
      const r = await register(a._id, x).expect(200);
      validates('AuctionCommandReceipt', r.body);
      expect(await wallet(x)).toMatchObject({ available: 480_000, auctionHeld: DEPOSIT });
      const part = await call('get', `/me/auctions/${a._id}/participation`, x).expect(200);
      validates('AuctionParticipation', part.body);
      expect(part.body).toMatchObject({ registrationState: 'Registered', deposit: DEPOSIT, heldAmount: DEPOSIT, ownLevel: null });
      expect((await bid(a._id, x, 200_000).expect(409)).body.code).toBe('AuctionNotStarted');
      await fill(a._id, y, z);
      expect(await kinds(x, a._id)).toEqual(['AuctionBiddingStarted', 'AuctionFundsHeld']);
      expect(await kinds(seller, a._id)).toEqual(['AuctionBiddingStarted']);
      // The hold is max(deposit, level): leading raises it, outbid returns it to the deposit.
      await bid(a._id, x, 200_000).expect(200);
      expect((await wallet(x)).auctionHeld).toBe(200_000);
      await bid(a._id, y, 250_000).expect(200);
      expect((await wallet(x)).auctionHeld).toBe(DEPOSIT);
      expect((await wallet(y)).auctionHeld).toBe(250_000);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: y.id, finalPrice: 250_000 });
      // Losers (bid or not) get the deposit back; the winner's is part of the price.
      expect(await wallet(x)).toMatchObject({ available: 500_000, auctionHeld: 0 });
      expect(await wallet(z)).toMatchObject({ available: 500_000, auctionHeld: 0 });
      expect((await wallet(y)).auctionHeld).toBe(250_000);
      expect([await regState(a._id, x), await regState(a._id, y), await regState(a._id, z)]).toEqual(['Refunded', 'Applied', 'Refunded']);
      expect(await reconciled()).toBe(true);
    });

    it('unhappy: seller, wrong deposit, twice, unfunded and no-registration auctions are refused', async () => {
      const { seller, a } = await liveOf();
      expect((await register(a._id, seller).expect(403)).body.code).toBe('SelfReviewForbidden');
      const x = await funded(100_000);
      expect((await register(a._id, x, 30_000).expect(409)).body.message).toContain('20.000đ');
      await register(a._id, x).expect(200);
      expect((await register(a._id, x).expect(409)).body.message).toMatch(/đã đăng ký/);
      const poor = await actor();
      expect((await register(a._id, poor).expect(409)).body.message).toMatch(/nạp thêm/);
      expect(await db.c.auction_registrations.countDocuments({ auctionId: a._id })).toBe(1);
      // ADR 0079: at least 4, no business maximum (1000 is a technical guard).
      const s2 = await actor();
      const l = await saleListing(s2);
      await cmd('post', '/auction-intakes', { ...intakeBody(l), minBidders: 3 }, s2).expect(422);
      await cmd('post', '/auction-intakes', { ...intakeBody(l), minBidders: 1001 }, s2).expect(422);
      await cmd('post', '/auction-intakes', { ...intakeBody(l), minBidders: 50 }, s2).expect(200);
      // An auction published without registration (legacy) refuses registration.
      toggle(false);
      const legacy = await openAuction();
      toggle(true);
      expect((await register(legacy.auctionId, x).expect(409)).body.message).toMatch(/không cần đăng ký/);
    });

    it('replay: the same key returns the same receipt and holds the deposit once', async () => {
      const { a } = await liveOf();
      const x = await funded(100_000);
      const key = randomUUID();
      const first = await register(a._id, x, DEPOSIT, key).expect(200);
      const again = await register(a._id, x, DEPOSIT, key).expect(200);
      expect(again.headers['idempotency-replayed']).toBe('true');
      expect(again.body).toEqual(first.body);
      expect((await wallet(x)).auctionHeld).toBe(DEPOSIT);
      // A different body with the same key is refused.
      await register(a._id, x, 30_000, key).expect(409);
    });

    it('race: one member registering twice at once holds one deposit', async () => {
      const { a } = await liveOf();
      const x = await funded(100_000);
      const results = await Promise.all([register(a._id, x), register(a._id, x)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await db.c.auctions.findOne({ _id: a._id }))!.registeredCount).toBe(1);
      expect((await wallet(x)).auctionHeld).toBe(DEPOSIT);
    });

    it('withdrawal refunds before bidding opens and is refused afterwards', async () => {
      const { a } = await liveOf();
      const [x, y] = [await funded(100_000), await funded(100_000)];
      await register(a._id, x).expect(200);
      await withdraw(a._id, x).expect(200);
      expect(await wallet(x)).toMatchObject({ available: 100_000, auctionHeld: 0 });
      expect(await regState(a._id, x)).toBe('Withdrawn');
      expect((await withdraw(a._id, x).expect(409)).body.message).toMatch(/không còn đăng ký/);
      await withdraw(a._id, y).expect(404);
      // ADR 0083: re-registering waits a minute after the withdrawal.
      expect((await register(a._id, x).expect(429)).body.code).toBe('RATE_LIMITED');
      // Re-registering is then allowed; the minimum is reached and withdrawal locks.
      pinClock(new Date(Date.now() + 61_000));
      try {
        await fill(a._id, x, y);
        expect((await withdraw(a._id, x).expect(409)).body.message).toMatch(/đã mở trả giá/);
      } finally {
        vi.restoreAllMocks();
      }
      expect((await db.c.auctions.findOne({ _id: a._id }))!.registeredCount).toBe(4);
    });

    it('ADR 0079: a minimum never reached by the end is cancelled, not sold; deposits come back', async () => {
      const { seller, a } = await liveOf({ minBidders: 5 });
      const [x, y] = [await funded(100_000), await funded(100_000)];
      await register(a._id, x).expect(200);
      await register(a._id, y).expect(200);
      // Even when only the close runs, too few registrants is a cancellation.
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ state: 'Cancelled', closeReason: 'RegistrationExpired', winnerId: null });
      expect(await wallet(x)).toMatchObject({ available: 100_000, auctionHeld: 0 });
      expect(await kinds(x, a._id)).toEqual(['AuctionCancelled', 'AuctionFundsHeld', 'AuctionFundsReleased']);
      expect(await kinds(seller, a._id)).toEqual(['AuctionCancelled']);
      expect(await regState(a._id, y)).toBe('Refunded');
      const pub = await call('get', `/auctions/${a._id}`).expect(200);
      expect(pub.body.auction.closeReason).toBe('RegistrationExpired');
    });

    it('a lone bidder never wins: four registered but one bid closes NotEnoughBidders', async () => {
      const { a } = await liveOf();
      const [x, y] = [await funded(500_000), await funded(500_000)];
      await fill(a._id, x, y);
      await bid(a._id, x, 300_000).expect(200);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ state: 'Unsold', closeReason: 'NotEnoughBidders', orderId: null });
      expect(await wallet(x)).toMatchObject({ available: 500_000, auctionHeld: 0 });
      expect(await wallet(y)).toMatchObject({ available: 500_000, auctionHeld: 0 });
    });

    it('sealed second price needs two sealed bids; with two the winner pays the second', async () => {
      const sealedOver = { auctionType: 'SealedSecond' as const, buyNowPrice: null };
      const lone = await liveOf(sealedOver);
      const [x, y] = [await funded(500_000), await funded(500_000)];
      await fill(lone.a._id, x, y);
      await cmd('post', `/auctions/${lone.a._id}/sealed-bid`, { amount: 400_000, fulfillmentMethod: 'SelfCollect' }, x).expect(200);
      expect(await closeAt(lone.a._id)).toMatchObject({ state: 'Unsold', closeReason: 'NotEnoughBidders' });
      const pair = await liveOf(sealedOver);
      await fill(pair.a._id, x, y);
      await cmd('post', `/auctions/${pair.a._id}/sealed-bid`, { amount: 400_000, fulfillmentMethod: 'SelfCollect' }, x).expect(200);
      await cmd('post', `/auctions/${pair.a._id}/sealed-bid`, { amount: 250_000, fulfillmentMethod: 'SelfCollect' }, y).expect(200);
      expect(await closeAt(pair.a._id)).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: x.id, finalPrice: 250_000 });
      expect(await wallet(y)).toMatchObject({ available: 500_000, auctionHeld: 0 });
      expect((await wallet(x)).auctionHeld).toBe(250_000);
    });

    it('a paying winner pays the price once; the deposit is part of it', async () => {
      const { a } = await liveOf();
      const [x, y] = [await funded(500_000), await funded(500_000)];
      await fill(a._id, x, y);
      await bid(a._id, x, 200_000).expect(200);
      await bid(a._id, y, 300_000).expect(200);
      const closed = await closeAt(a._id);
      await longSession(y);
      pinClock(new Date(closed.closedAt!.getTime() + 60_000));
      await payOrder(closed.orderId!, y).expect(200);
      vi.restoreAllMocks();
      const order = (await db.c.point_orders.findOne({ _id: closed.orderId! }))!;
      expect(await wallet(y)).toMatchObject({ available: 500_000 - order.buyerTotal, auctionHeld: 0 });
      expect(await regState(a._id, y)).toBe('Applied');
    });

    it('a non-paying winner forfeits the deposit to the platform; the rest is released', async () => {
      const { seller, a } = await liveOf();
      const [x, y] = [await funded(500_000), await funded(500_000)];
      await fill(a._id, x, y);
      await bid(a._id, x, 200_000).expect(200);
      await bid(a._id, y, 300_000).expect(200);
      const closed = await closeAt(a._id);
      const before = await platform();
      pinClock(closed.paymentDeadline!);
      await app.get(AuctionWorker).tick();
      vi.restoreAllMocks();
      expect((await db.c.auctions.findOne({ _id: a._id }))!.state).toBe('PaymentExpired');
      expect(await regState(a._id, y)).toBe('Forfeited');
      expect(await wallet(y)).toMatchObject({ available: 500_000 - DEPOSIT, auctionHeld: 0 });
      // The tick may expire earlier unpaid wins of this block too, so the
      // platform gains at least this deposit, posted by one journal here.
      expect((await platform()) - before).toBeGreaterThanOrEqual(DEPOSIT);
      const journals = await db.c.ledger_journals.find({ auctionId: a._id, type: 'AuctionDepositForfeit' }).toArray();
      expect(journals).toHaveLength(1);
      const entries = await db.c.ledger_entries.find({ journalId: journals[0]._id }).toArray();
      expect(entries.find((e) => e.accountId === PLATFORM_COMMISSION_ACCOUNT_ID)?.debit).toBe(DEPOSIT);
      expect(await kinds(y, a._id)).toContain('AuctionDepositForfeited');
      // The seller is not paid the deposit.
      expect(await kinds(seller, a._id)).not.toContain('AuctionDepositForfeited');
      expect((await wallet(seller)).available).toBe(0);
      expect(await reconciled()).toBe(true);
      // The full-ledger reconcile scans every journal written by this file.
    }, 30_000);

    it('Dutch: acceptance needs the minimum registered; one acceptance then sells', async () => {
      const { a } = await liveOf({
        auctionType: 'Dutch',
        buyNowPrice: null,
        dutchTopPrice: 400_000,
        dutchIntervalSeconds: 60,
      });
      const [x, y] = [await funded(500_000), await funded(500_000)];
      await register(a._id, x).expect(200);
      const early = await cmd('post', `/auctions/${a._id}/dutch-accept`, { price: 400_000, fulfillmentMethod: 'SelfCollect' }, x).expect(409);
      expect(early.body.code).toBe('AuctionNotStarted');
      await fill(a._id, y);
      await cmd('post', `/auctions/${a._id}/dutch-accept`, { price: 400_000, fulfillmentMethod: 'SelfCollect' }, x).expect(200);
      const closed = await closeAt(a._id);
      expect(closed).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: x.id });
      expect(await wallet(y)).toMatchObject({ available: 500_000, auctionHeld: 0 });
    });

    it('Dutch: the price only starts falling once enough members registered', async () => {
      const { a } = await liveOf({
        auctionType: 'Dutch',
        buyNowPrice: null,
        dutchTopPrice: 400_000,
        dutchIntervalSeconds: 60,
      });
      const [x, y, f1, f2] = [await funded(500_000), await funded(500_000), await funded(100_000), await funded(100_000)];
      await register(a._id, x).expect(200);
      // Ten minutes after the open time passed the minimum is reached: the
      // auction opens then, and the Dutch clock starts there.
      const opened = new Date(a.publishedAt.getTime() + 10 * 60_000);
      pinClock(opened);
      for (const m of [y, f1, f2]) await register(a._id, m).expect(200);
      vi.restoreAllMocks();
      expect(await doc(a._id)).toMatchObject({ biddingOpenedAt: opened, startAt: opened });
      // 125 s after opening: two drops (300,000), not twelve (floor).
      pinClock(new Date(opened.getTime() + 125_000));
      const low = await cmd('post', `/auctions/${a._id}/dutch-accept`, { price: 250_000, fulfillmentMethod: 'SelfCollect' }, x).expect(409);
      expect(low.body.message).toContain('300.000đ');
      await cmd('post', `/auctions/${a._id}/dutch-accept`, { price: 300_000, fulfillmentMethod: 'SelfCollect' }, x).expect(200);
      vi.restoreAllMocks();
      expect((await db.c.auctions.findOne({ _id: a._id }))!.currentPrice).toBe(300_000);
    });

    it('Instant Buy Now needs another bidder first; then it ends the auction', async () => {
      const { a } = await liveOf({ buyNowMode: 'Instant' });
      const [x, y] = [await funded(1_000_000), await funded(1_000_000)];
      await fill(a._id, x, y);
      const lone = await cmd('post', `/auctions/${a._id}/buy-now`, { fulfillmentMethod: 'SelfCollect' }, x).expect(409);
      expect(lone.body.message).toMatch(/người khác trả giá/);
      // A bid that reaches the Buy Now price is the same Instant end.
      expect((await bid(a._id, x, 600_000).expect(409)).body.message).toMatch(/người khác trả giá/);
      expect(await db.c.auction_bids.countDocuments({ auctionId: a._id })).toBe(0);
      await bid(a._id, y, 200_000).expect(200);
      await cmd('post', `/auctions/${a._id}/buy-now`, { fulfillmentMethod: 'SelfCollect' }, x).expect(200);
      const after = (await db.c.auctions.findOne({ _id: a._id }))!;
      expect(after).toMatchObject({ leaderId: x.id, currentPrice: 600_000, bidderCount: 2 });
      expect(after.endAt).toEqual(after.buyNowAt);
      expect(await closeAt(a._id)).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: x.id });
    });

    it('review fixes: reschedule notifies registrants; a registered Admin cannot cancel; refund wording', async () => {
      const { seller, a } = await liveOf({}, { startAt: new Date(Date.now() + 3600_000).toISOString() });
      const [x, y, z] = [await funded(500_000), await funded(500_000), await funded(500_000)];
      await register(a._id, x).expect(200);
      // ADR 0079/0081: a waiting auction may move its open time (a time is required).
      const v1 = (await db.c.auctions.findOne({ _id: a._id }))!.version;
      await reschedule(a._id, seller, { expectedVersion: v1, startAt: null, durationSeconds: 2 * 3600 }).expect(422);
      const at = new Date(Date.now() + 2 * 3600_000).toISOString();
      await reschedule(a._id, seller, { expectedVersion: v1, startAt: at, durationSeconds: 2 * 3600 }).expect(200);
      expect(await doc(a._id)).toMatchObject({ openMode: 'ScheduledGrace', opensAt: new Date(at), startAt: new Date(Date.parse(at) + 24 * 3600_000), scheduleRevision: 1 });
      expect(await kinds(x, a._id)).toContain('AuctionRescheduled');
      const moved = await db.c.member_notifications.findOne({ userId: x.id, targetId: a._id, kind: 'AuctionRescheduled' });
      expect(moved!.body).toMatch(/chờ thêm tới/);
      // Bug 2: an Admin who registered is involved.
      const registeredAdmin = await actor(['MEMBER', 'ADMIN']);
      await fund(registeredAdmin, 100_000);
      await register(a._id, registeredAdmin).expect(200);
      const v2 = (await db.c.auctions.findOne({ _id: a._id }))!.version;
      expect((await cmd('post', `/operations/auctions/${a._id}/cancel`, { expectedVersion: v2, reason: 'Sách không đúng mô tả kiểm định' }, registeredAdmin).expect(403)).body.code).toBe('SelfReviewForbidden');
      // Bug 3: a loser's refund says they did not win.
      await register(a._id, y).expect(200);
      await register(a._id, z).expect(200);
      // Enough registered: it opens at the open time (no open-now command).
      await cmd('post', `/auctions/${a._id}/open-now`, { expectedVersion: (await doc(a._id)).version }, seller).expect(404);
      expect(await doc(a._id)).toMatchObject({ startAt: new Date(at), biddingOpenedAt: new Date(at) });
      for (const m of [x, y]) await longSession(m);
      pinClock(new Date(at));
      await bid(a._id, x, 200_000).expect(200);
      await bid(a._id, y, 250_000).expect(200);
      vi.restoreAllMocks();
      await closeAt(a._id);
      const zRefund = await db.c.member_notifications.findOne({ userId: z.id, targetId: a._id, kind: 'AuctionFundsReleased' });
      expect(zRefund!.body).toMatch(/không thắng/);
      expect(zRefund!.body).not.toMatch(/vượt giá chốt/);
    });

    it('cancel notifies registrants who never bid', async () => {
      const { a } = await liveOf();
      const [x, y] = [await funded(500_000), await funded(100_000)];
      await fill(a._id, x, y);
      await bid(a._id, x, 200_000).expect(200);
      const v = (await db.c.auctions.findOne({ _id: a._id }))!.version;
      await cmd('post', `/operations/auctions/${a._id}/cancel`, { expectedVersion: v, reason: 'Sách không đúng mô tả kiểm định' }, admin).expect(200);
      const note = await db.c.member_notifications.findOne({ userId: y.id, targetId: a._id, kind: 'AuctionCancelled' });
      expect(note!.body).toMatch(/được trả lại ví/);
    });

    it('cancel refunds every deposit', async () => {
      const { a } = await liveOf();
      const [x, y] = [await funded(100_000), await funded(100_000)];
      await register(a._id, x).expect(200);
      await register(a._id, y).expect(200);
      const v = (await db.c.auctions.findOne({ _id: a._id }))!.version;
      await cmd('post', `/operations/auctions/${a._id}/cancel`, { expectedVersion: v, reason: 'Sách không đúng mô tả kiểm định' }, admin).expect(200);
      expect(await wallet(x)).toMatchObject({ available: 100_000, auctionHeld: 0 });
      expect(await wallet(y)).toMatchObject({ available: 100_000, auctionHeld: 0 });
      expect(await regState(a._id, x)).toBe('Refunded');
    });

    // ADR 0079: every waiting or held auction has a fixed ceiling; commands
    // refuse past it and the worker records the exit with every hold released.
    describe('ADR 0079: bounded registration lifecycle', () => {
      const H = 3_600_000;
      const v = async (id: string) => (await doc(id)).version;
      // Callers pass the current version (await v(id)) so .expect chains.
      const setMin = (id: string, who: Actor, minBidders: number, version: number) =>
        cmd('post', `/auctions/${id}/min-bidders`, { expectedVersion: version, minBidders }, who);
      const sellerClose = (id: string, who: Actor, version: number) =>
        cmd('post', `/auctions/${id}/close`, { expectedVersion: version }, who);
      const moveTo = (id: string, who: Actor, at: Date, version: number, durationSeconds = 3600) =>
        cmd('post', `/auctions/${id}/schedule`, { expectedVersion: version, startAt: at.toISOString(), durationSeconds }, who);
      const tickAt = async (at: Date) => {
        pinClock(at);
        try {
          return await app.get(AuctionWorker).tick();
        } finally {
          vi.restoreAllMocks();
        }
      };
      const noHolds = async (...members: Actor[]) => {
        for (const m of members) expect((await wallet(m)).auctionHeld).toBe(0);
      };

      it('ADR 0081: publishing needs an open time; past it with too few the auction waits 24 h and opens the moment the minimum registers', async () => {
        const none = await passedIntake();
        await publish(none.intakeId, none.seller, { startAt: null }).expect(422);
        const { a } = await liveOf({}, { durationSeconds: 2 * 3600 });
        expect(a.openMode).toBe('ScheduledGrace');
        expect(a.startAt.getTime()).toBe(a.opensAt!.getTime() + 24 * H);
        expect(a.plannedEndAt.getTime() - a.startAt.getTime()).toBe(2 * H);
        const pub = (await call('get', `/auctions/${a._id}`).expect(200)).body;
        validates('PublicAuction', pub);
        expect(pub.auction).toMatchObject({
          phase: 'Scheduled',
          openMode: 'ScheduledGrace',
          opensAt: a.opensAt!.toISOString(),
          latestStartAt: new Date(a.publishedAt.getTime() + 30 * 24 * H).toISOString(),
          holdExpiresAt: null,
        });
        const x = await funded(500_000);
        await fill(a._id, x);
        const opened = await doc(a._id);
        expect(opened.startAt.getTime()).toBeLessThanOrEqual(Date.now());
        expect(opened.endAt.getTime() - opened.startAt.getTime()).toBe(2 * H);
        expect(opened.biddingOpenedAt).toEqual(opened.startAt);
        await bid(a._id, x, 200_000).expect(200);
      });

      it('ceiling: too few at 24 h cancels; every late action is refused; holds are zero; a second tick does nothing', async () => {
        const { seller, a } = await liveOf();
        const [x, y, z] = [await funded(100_000), await funded(100_000), await funded(100_000)];
        await register(a._id, x).expect(200);
        await register(a._id, y).expect(200);
        for (const m of [seller, x, y, z]) await longSession(m);
        pinClock(a.startAt);
        expect((await register(a._id, z).expect(409)).body.code).toBe('AuctionClosed');
        expect((await withdraw(a._id, x).expect(409)).body.code).toBe('AuctionClosed');
        await bid(a._id, x, 200_000).expect(409);
        await moveTo(a._id, seller, new Date(a.startAt.getTime() + H), await v(a._id)).expect(409);
        await setMin(a._id, seller, 4, await v(a._id)).expect(409);
        await sellerClose(a._id, seller, await v(a._id)).expect(409);
        vi.restoreAllMocks();
        await tickAt(a.startAt);
        const after = await doc(a._id);
        expect(after).toMatchObject({ state: 'Cancelled', closeReason: 'RegistrationExpired', winnerId: null });
        await noHolds(x, y);
        expect(await wallet(x)).toMatchObject({ available: 100_000 });
        expect(await regState(a._id, x)).toBe('Refunded');
        expect((await db.c.auction_intakes.findOne({ _id: a.intakeId }))!.state).toBe('ReclaimRequired');
        const note = await db.c.member_notifications.findOne({ userId: x.id, targetId: a._id, kind: 'AuctionCancelled' });
        expect(note!.body).toMatch(/không đủ 4 người/);
        await tickAt(new Date(a.startAt.getTime() + 60_000));
        expect((await doc(a._id)).version).toBe(after.version);
      });

      it('ADR 0081/0082: open time within 30 days; enough people open then; too few wait 24 h more, open on reaching it, else cancel', async () => {
        const far = await passedIntake();
        await publish(far.intakeId, far.seller, { startAt: new Date(Date.now() + 30 * 24 * H + H).toISOString() }).expect(422);
        // ADR 0082: a month ahead is allowed.
        const month = await passedIntake();
        await publish(month.intakeId, month.seller, { startAt: new Date(Date.now() + 29 * 24 * H).toISOString() }).expect(200);
        const at = new Date(Date.now() + 3 * H);
        const { a } = await liveOf({}, { startAt: at.toISOString(), durationSeconds: 3600 });
        expect(a).toMatchObject({ openMode: 'ScheduledGrace', opensAt: at, startAt: new Date(at.getTime() + 24 * H) });
        const x = await funded(500_000);
        await fill(a._id, x);
        expect(await doc(a._id)).toMatchObject({ startAt: at, endAt: new Date(at.getTime() + H), biddingOpenedAt: at });
        expect((await bid(a._id, x, 200_000).expect(409)).body.code).toBe('AuctionNotStarted');
        await longSession(x);
        pinClock(at);
        await bid(a._id, x, 200_000).expect(200);
        vi.restoreAllMocks();
        // Too few at the open time: still waiting, nobody can bid yet.
        const late = await liveOf({}, { startAt: at.toISOString(), durationSeconds: 3600 });
        const few = await liveOf({}, { startAt: at.toISOString(), durationSeconds: 3600 });
        const lateMembers = [await funded(500_000), await funded(100_000), await funded(100_000), await funded(100_000)];
        const y = await funded(100_000);
        for (const m of [...lateMembers, y]) await longSession(m);
        await register(late.a._id, lateMembers[0]).expect(200);
        await register(few.a._id, y).expect(200);
        await tickAt(at);
        for (const id of [late.a._id, few.a._id]) expect(await doc(id)).toMatchObject({ state: 'Active', closeReason: null });
        expect((await call('get', `/auctions/${few.a._id}`).expect(200)).body.auction.phase).toBe('Scheduled');
        pinClock(new Date(at.getTime() + H));
        expect((await bid(late.a._id, lateMembers[0], 200_000).expect(409)).body.code).toBe('AuctionNotStarted');
        // Reached 5 h after the open time: it opens at that moment, same length.
        const reached = new Date(at.getTime() + 5 * H);
        pinClock(reached);
        for (const m of lateMembers.slice(1)) await register(late.a._id, m).expect(200);
        expect(await doc(late.a._id)).toMatchObject({ startAt: reached, endAt: new Date(reached.getTime() + H), biddingOpenedAt: reached });
        await bid(late.a._id, lateMembers[0], 200_000).expect(200);
        vi.restoreAllMocks();
        await tickAt(new Date(at.getTime() + 24 * H - 60_000));
        expect((await doc(few.a._id)).state).toBe('Active');
        await tickAt(new Date(at.getTime() + 24 * H));
        expect(await doc(few.a._id)).toMatchObject({ state: 'Cancelled', closeReason: 'RegistrationExpired' });
        const note = await db.c.member_notifications.findOne({ userId: y.id, targetId: few.a._id, kind: 'AuctionCancelled' });
        expect(note!.body).toMatch(/trong 24 giờ sau giờ mở/);
        await noHolds(y);
      });

      it('no open-now; rescheduling has a 2-change limit, a 30-minute freeze, the 30-day ceiling and stops once the open time passed', async () => {
        const { seller, a } = await liveOf({}, { startAt: new Date(Date.now() + 2 * H).toISOString() });
        await cmd('post', `/auctions/${a._id}/open-now`, { expectedVersion: await v(a._id) }, seller).expect(404);
        const x = await funded(100_000);
        await register(a._id, x).expect(200);
        await moveTo(a._id, seller, new Date(a.publishedAt.getTime() + 30 * 24 * H + 60_000), await v(a._id)).expect(422);
        await cmd('post', `/auctions/${a._id}/schedule`, { expectedVersion: await v(a._id), startAt: null, durationSeconds: 3600 }, seller).expect(422);
        for (let i = 1; i <= 2; i++)
          await moveTo(a._id, seller, new Date(Date.now() + 2 * H + i * 10 * 60_000), await v(a._id)).expect(200);
        expect((await moveTo(a._id, seller, new Date(Date.now() + 4 * H), await v(a._id)).expect(409)).body.message).toMatch(/tối đa 2 lần/);
        expect((await kinds(x, a._id)).filter((k) => k === 'AuctionRescheduled')).toHaveLength(2);
        const second = await liveOf({}, { startAt: new Date(Date.now() + 2 * H).toISOString() });
        await longSession(second.seller);
        pinClock(new Date(second.a.opensAt!.getTime() - 20 * 60_000));
        expect((await moveTo(second.a._id, second.seller, new Date(second.a.opensAt!.getTime() + H), await v(second.a._id)).expect(409)).body.message).toMatch(/30 phút/);
        vi.restoreAllMocks();
        await fill(second.a._id);
        const d = await doc(second.a._id);
        expect(d).toMatchObject({ startAt: second.a.opensAt, biddingOpenedAt: second.a.opensAt });
        expect(d.endAt.getTime() - d.startAt.getTime()).toBe(24 * H);
        // Past the open time the auction only waits; it cannot be moved again.
        const due = await liveOf();
        expect((await moveTo(due.a._id, due.seller, new Date(Date.now() + 3 * H), await v(due.a._id)).expect(409)).body.message).toMatch(/Đã qua giờ mở/);
      });

      it('minimum: only lowered, never below 4, locked once reached; reaching it past the open time opens at once', async () => {
        const { seller, a } = await liveOf({ minBidders: 6 });
        const members = [await funded(500_000), await funded(100_000), await funded(100_000), await funded(100_000)];
        for (const m of members) await register(a._id, m).expect(200);
        await setMin(a._id, seller, 7, await v(a._id)).expect(422);
        await setMin(a._id, seller, 3, await v(a._id)).expect(422);
        await setMin(a._id, members[0], 5, await v(a._id)).expect(404);
        await setMin(a._id, seller, 5, await v(a._id)).expect(200);
        expect(await doc(a._id)).toMatchObject({ minBidders: 5, biddingOpenedAt: null });
        await setMin(a._id, seller, 4, await v(a._id)).expect(200);
        const d = await doc(a._id);
        expect(d.biddingOpenedAt).toEqual(d.startAt);
        expect(d.startAt.getTime()).toBeLessThanOrEqual(Date.now());
        await bid(a._id, members[0], 200_000).expect(200);
        const sched = await liveOf({ minBidders: 5 }, { startAt: new Date(Date.now() + 2 * H).toISOString() });
        await fill(sched.a._id);
        expect((await setMin(sched.a._id, sched.seller, 4, await v(sched.a._id)).expect(409)).body.message).toMatch(/giữ nguyên/);
      });

      it('the seller closes before the start (refunds, book back, registrants told), never after', async () => {
        const { seller, a } = await liveOf();
        const x = await funded(100_000);
        await register(a._id, x).expect(200);
        // The older intake withdrawal would keep deposits held: refused here.
        const iv = (await db.c.auction_intakes.findOne({ _id: a.intakeId }))!.version;
        expect((await cmd('post', `/auction-intakes/${a.intakeId}/cancel`, { expectedVersion: iv }, seller).expect(409)).body.message).toMatch(/Đóng phiên/);
        expect(await regState(a._id, x)).toBe('Registered');
        await sellerClose(a._id, await actor(), await v(a._id)).expect(404);
        const r = await sellerClose(a._id, seller, await v(a._id)).expect(200);
        validates('AuctionCommandReceipt', r.body);
        expect(await doc(a._id)).toMatchObject({ state: 'Cancelled', closeReason: 'SellerClosed' });
        await noHolds(x);
        expect(await wallet(x)).toMatchObject({ available: 100_000 });
        expect(await regState(a._id, x)).toBe('Refunded');
        expect((await db.c.auction_intakes.findOne({ _id: a.intakeId }))!.state).toBe('ReclaimRequired');
        const note = await db.c.member_notifications.findOne({ userId: x.id, targetId: a._id, kind: 'AuctionCancelled' });
        expect(note!.body).toMatch(/người bán đóng/);
        await sellerClose(a._id, seller, await v(a._id)).expect(409);
        const live = await liveOf();
        await fill(live.a._id);
        expect((await sellerClose(live.a._id, live.seller, await v(live.a._id)).expect(409)).body.message).toMatch(/đã bắt đầu/);
      });

      it('OnHold auto-cancels 48 h after it was held, with full refunds; before that it stays held', async () => {
        const { seller, a } = await liveOf();
        const [x, y] = [await funded(500_000), await funded(500_000)];
        await fill(a._id, x, y);
        await bid(a._id, x, 200_000).expect(200);
        await bid(a._id, y, 250_000).expect(200);
        await db.setStatus(seller.id, 'LOCKED');
        await app.get(AuctionWorker).tick();
        const held = await doc(a._id);
        expect(held.state).toBe('OnHold');
        const expires = new Date(held.heldAt!.getTime() + 48 * H);
        expect((await call('get', `/auctions/${a._id}`).expect(200)).body.auction.holdExpiresAt).toBe(expires.toISOString());
        await tickAt(new Date(expires.getTime() - H));
        expect((await doc(a._id)).state).toBe('OnHold');
        await tickAt(expires);
        expect(await doc(a._id)).toMatchObject({ state: 'Cancelled', closeReason: 'HoldExpired', winnerId: null });
        await noHolds(x, y);
        expect(await wallet(y)).toMatchObject({ available: 500_000 });
        expect(await regState(a._id, y)).toBe('Refunded');
      });

      it('an assigned independent Admin closes a reported auction with a message; nobody else can', async () => {
        const { seller, a } = await liveOf();
        const [x, y] = [await funded(500_000), await funded(500_000)];
        await fill(a._id, x, y);
        await bid(a._id, x, 200_000).expect(200);
        const flagged = await cmd('post', '/me/support-cases', {
          kind: 'Violation',
          title: 'Nghi ngờ trả giá gian lận: phiên thử',
          description: 'Một tài khoản lạ liên tục đẩy giá phiên này.',
          target: { type: 'Auction', id: a._id },
        }, y).expect(200);
        const caseId = flagged.body.entityId as string;
        const message = 'Phiên có dấu hiệu đẩy giá bằng tài khoản phụ.';
        const closeIt = (who: Actor, body: { expectedVersion?: number; auctionVersion: number; message?: string }, key?: string) =>
          cmd('post', `/operations/support-cases/${caseId}/close-auction`, { expectedVersion: 2, message, ...body }, who, key);
        // Not assigned yet.
        await closeIt(admin, { expectedVersion: 1, auctionVersion: await v(a._id) }).expect(409);
        await cmd('post', `/operations/support-cases/${caseId}/actions`, { expectedVersion: 1, action: 'Assign', text: 'Admin đã nhận hồ sơ.' }, admin).expect(200);
        const involved = await actor(['ADMIN', 'MEMBER']);
        await fund(involved, 100_000);
        await register(a._id, involved).expect(200);
        const av = await v(a._id);
        expect((await closeIt(involved, { auctionVersion: av }).expect(403)).body.code).toBe('SelfReviewForbidden');
        await closeIt(admin, { auctionVersion: av - 1 }).expect(409);
        await closeIt(admin, { auctionVersion: av, message: 'ngắn' }).expect(422);
        expect((await doc(a._id)).state).toBe('Active');
        const key = randomUUID();
        const done = await closeIt(admin, { auctionVersion: av }, key).expect(200);
        validates('SupportCaseReceipt', done.body);
        const again = await closeIt(admin, { auctionVersion: av }, key).expect(200);
        expect(again.headers['idempotency-replayed']).toBe('true');
        expect(again.body).toEqual(done.body);
        expect(await doc(a._id)).toMatchObject({ state: 'Cancelled', closeReason: 'Reported', cancelReason: message });
        expect((await db.c.support_cases.findOne({ _id: caseId }))!.state).toBe('Answered');
        await noHolds(x, y, involved);
        for (const m of [x, seller]) {
          const n = await db.c.member_notifications.findOne({ userId: m.id, targetId: a._id, kind: 'AuctionCancelled' });
          expect(n!.body).toContain('tài khoản phụ');
        }
        expect(await db.c.member_notifications.countDocuments({ userId: y.id, kind: 'SupportUpdated', targetId: caseId })).toBeGreaterThan(0);
        await closeIt(admin, { expectedVersion: 3, auctionVersion: await v(a._id) }).expect(409);
      });

      // ADR 0083 (H1): past its end the auction stays Active until the worker
      // closes it; a report close in that gap still works, and exactly one of
      // the close and the report close wins.
      it('ADR 0083: a report closes an auction past its end before the worker; the worker then does nothing', async () => {
        const { a } = await liveOf();
        const [x, y] = [await funded(500_000), await funded(500_000)];
        const fillers = await fill(a._id, x, y);
        await bid(a._id, x, 200_000).expect(200);
        const caseId = (await cmd('post', '/me/support-cases', {
          kind: 'Violation',
          title: 'Nghi ngờ trả giá gian lận: phiên thử',
          description: 'Một tài khoản lạ liên tục đẩy giá phiên này.',
          target: { type: 'Auction', id: a._id },
        }, y).expect(200)).body.entityId as string;
        await cmd('post', `/operations/support-cases/${caseId}/actions`, { expectedVersion: 1, action: 'Assign', text: 'Admin đã nhận hồ sơ.' }, admin).expect(200);
        const open = await doc(a._id);
        await longSession(admin);
        pinClock(new Date(open.endAt.getTime() + 60_000));
        try {
          const message = 'Phiên có dấu hiệu đẩy giá bằng tài khoản phụ.';
          await cmd('post', `/operations/support-cases/${caseId}/close-auction`, { expectedVersion: 2, auctionVersion: open.version, message }, admin).expect(200);
        } finally {
          vi.restoreAllMocks();
        }
        expect(await doc(a._id)).toMatchObject({ state: 'Cancelled', closeReason: 'Reported', winnerId: null, orderId: null });
        await tickAt(new Date(open.endAt.getTime() + 2 * 60_000));
        expect(await doc(a._id)).toMatchObject({ state: 'Cancelled', orderId: null });
        expect(await db.c.point_orders.countDocuments({ auctionId: a._id })).toBe(0);
        await noHolds(x, y, ...fillers);
      });

      it('ADR 0083: the worker close and a report close on the same version - exactly one wins', async () => {
        const { a } = await liveOf();
        const [x, y] = [await funded(500_000), await funded(500_000)];
        const fillers = await fill(a._id, x, y);
        await bid(a._id, x, 200_000).expect(200);
        await bid(a._id, y, 250_000).expect(200);
        const caseId = (await cmd('post', '/me/support-cases', {
          kind: 'Violation',
          title: 'Nghi ngờ trả giá gian lận: phiên thử',
          description: 'Một tài khoản lạ liên tục đẩy giá phiên này.',
          target: { type: 'Auction', id: a._id },
        }, x).expect(200)).body.entityId as string;
        await cmd('post', `/operations/support-cases/${caseId}/actions`, { expectedVersion: 1, action: 'Assign', text: 'Admin đã nhận hồ sơ.' }, admin).expect(200);
        const open = await doc(a._id);
        await longSession(admin);
        pinClock(new Date(open.endAt.getTime() + 60_000));
        let report: { status: number };
        try {
          [report] = await Promise.all([
            cmd('post', `/operations/support-cases/${caseId}/close-auction`, {
              expectedVersion: 2,
              auctionVersion: open.version,
              message: 'Phiên có dấu hiệu đẩy giá bằng tài khoản phụ.',
            }, admin),
            app.get(AuctionWorker).tick(),
          ]);
        } finally {
          vi.restoreAllMocks();
        }
        const after = await doc(a._id);
        if (report.status === 200) {
          expect(after).toMatchObject({ state: 'Cancelled', closeReason: 'Reported', orderId: null });
          expect(await db.c.point_orders.countDocuments({ auctionId: a._id })).toBe(0);
          await noHolds(x, y, ...fillers);
        } else {
          expect(report.status).toBe(409);
          expect(after).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: y.id });
          expect(await db.c.point_orders.countDocuments({ auctionId: a._id })).toBe(1);
          expect((await db.c.support_cases.findOne({ _id: caseId }))!.state).toBe('InReview');
        }
      });

      // ADR 0083 (M5): registration takes the POL-41 limits.
      it('ADR 0083: a 6th open registration, a quick re-registration and too many registrations a minute are refused', async () => {
        const m = await funded(2_000_000);
        const runs = [];
        for (let i = 0; i < 6; i++) runs.push((await liveOf()).a);
        for (const r of runs.slice(0, 5)) await register(r._id, m).expect(200);
        const sixth = await register(runs[5]._id, m).expect(429);
        expect(sixth.body).toMatchObject({ code: 'RATE_LIMITED' });
        expect(sixth.body.message).toMatch(/tối đa 5 phiên/);
        expect(await regState(runs[5]._id, m)).toBeUndefined();
        // Withdrawing frees a slot, but the same auction waits a minute.
        await withdraw(runs[0]._id, m).expect(200);
        expect((await register(runs[0]._id, m).expect(429)).body.message).toMatch(/quá nhanh/);
        await register(runs[5]._id, m).expect(200);
        expect((await wallet(m)).auctionHeld).toBe(5 * DEPOSIT);
        // 30 registrations or withdrawals in the last minute (fixture rows).
        const z = await funded(500_000);
        const now = new Date();
        await db.c.auction_registrations.insertMany(
          Array.from({ length: 30 }, () => {
            const auctionId = randomUUID();
            return {
              _id: `${auctionId}:${z.id}`,
              auctionId,
              userId: z.id,
              deposit: DEPOSIT,
              state: 'Withdrawn' as const,
              createdAt: now,
              updatedAt: now,
              version: 2,
              lockSeq: 0,
            };
          }),
        );
        expect((await register(runs[1]._id, z).expect(429)).body.message).toMatch(/quá nhanh/);
        expect((await wallet(z)).auctionHeld).toBe(0);
      });

      it('randomized: seller, member and Admin actions with clock jumps end every auction with no money held', async () => {
        let seed = 0x5eed;
        const rnd = () => {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          return seed / 0x7fffffff;
        };
        const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
        const members: Actor[] = [];
        for (let i = 0; i < 6; i++) members.push(await funded(2_000_000));
        const runs: Awaited<ReturnType<typeof liveOf>>[] = [];
        for (let i = 0; i < 4; i++)
          runs.push(
            await liveOf(
              { minBidders: 4 + Math.floor(rnd() * 2) },
              rnd() < 0.5
                ? { startAt: new Date(Date.now() + (1 + Math.floor(rnd() * 60)) * H).toISOString(), durationSeconds: 3600 }
                : { durationSeconds: 3600 },
            ),
          );
        for (const m of [...members, ...runs.map((r) => r.seller), admin]) await longSession(m);
        const published = Math.min(...runs.map((r) => r.a.publishedAt.getTime()));
        let clock = Date.now();
        let committed = 0;
        const actions = ['register', 'register', 'register', 'withdraw', 'bid', 'bid', 'move', 'lower', 'close', 'cancel', 'jump', 'jump'] as const;
        for (let step = 0; step < 40; step++) {
          const r = pick(runs);
          const a = await doc(r.a._id);
          const m = pick(members);
          const action = pick(actions);
          pinClock(new Date(clock));
          let res: { status: number } | undefined;
          if (action === 'register') res = await register(a._id, m);
          else if (action === 'withdraw') res = await withdraw(a._id, m);
          else if (action === 'bid') res = await bid(a._id, m, a.currentPrice === null ? a.startPrice : a.currentPrice + a.step);
          else if (action === 'move') res = await moveTo(a._id, r.seller, new Date(clock + (1 + Math.floor(rnd() * 80)) * H), await v(a._id));
          else if (action === 'lower') res = await setMin(a._id, r.seller, 4, await v(a._id));
          else if (action === 'close') res = await sellerClose(a._id, r.seller, await v(a._id));
          else if (action === 'cancel' && rnd() < 0.3)
            res = await cmd('post', `/operations/auctions/${a._id}/cancel`, { expectedVersion: a.version, reason: 'Kiểm thử ngẫu nhiên vòng đời phiên.' }, admin);
          else if (action === 'jump') {
            clock = Math.min(clock + Math.floor(rnd() * 8) * H, published + 70 * H);
            pinClock(new Date(clock));
            await app.get(AuctionWorker).tick();
          }
          vi.restoreAllMocks();
          if (res) {
            expect(res.status).toBeLessThan(500);
            if (res.status === 200) committed++;
          }
        }
        expect(committed).toBeGreaterThan(0);
        // Longest possible life: open time ceiling 30 days + 24 h waiting +
        // 1 h auction + 24 h payment.
        const bound = Math.max(...runs.map((r) => r.a.publishedAt.getTime())) + (30 * 24 + 49) * H;
        await tickAt(new Date(bound));
        await tickAt(new Date(bound));
        for (const r of runs)
          expect(['Unsold', 'Cancelled', 'PaymentExpired']).toContain((await doc(r.a._id)).state);
        for (const m of members) expect((await wallet(m)).auctionHeld).toBe(0);
        for (const r of runs)
          expect(await db.c.auction_registrations.countDocuments({ auctionId: r.a._id, state: 'Registered' })).toBe(0);
      }, 180_000);

      // ADR 0080: an Admin resumes an OnHold auction once; no deadline moves.
      describe('ADR 0080: Admin resume and live pushes', () => {
        const resume = (id: string, who: Actor, version: number, key?: string, reason = 'Người bán đã xác minh lại tài khoản.') =>
          cmd('post', `/operations/auctions/${id}/resume`, { expectedVersion: version, reason }, who, key);
        const heldAuction = async () => {
          const { seller, a } = await liveOf();
          const [x, y] = [await funded(500_000), await funded(500_000)];
          const fillers = await fill(a._id, x, y);
          await bid(a._id, x, 200_000).expect(200);
          await bid(a._id, y, 250_000).expect(200);
          return { seller, a, x, y, fillers };
        };

        it('resumes an OnHold auction once without moving any deadline; refused while still ineligible', async () => {
          const { seller, a, x, y, fillers } = await heldAuction();
          await db.setStatus(seller.id, 'LOCKED');
          await app.get(AuctionWorker).tick();
          const held = await doc(a._id);
          expect(held.state).toBe('OnHold');
          expect((await resume(a._id, admin, held.version).expect(409)).body.message).toMatch(/chưa đủ điều kiện/);
          await db.setStatus(seller.id, 'ACTIVE');
          await resume(a._id, x, held.version).expect(403);
          await resume(a._id, admin, held.version - 1).expect(409);
          await resume(a._id, admin, held.version, undefined, 'ngắn').expect(422);
          expect((await doc(a._id)).state).toBe('OnHold');
          const money = await wallet(y);
          const nudge = vi.spyOn(app.get(AuctionLiveService), 'nudge');
          const key = randomUUID();
          const done = await resume(a._id, admin, held.version, key).expect(200);
          expect(nudge).toHaveBeenCalled();
          nudge.mockRestore();
          validates('AuctionCommandReceipt', done.body);
          const again = await resume(a._id, admin, held.version, key).expect(200);
          expect(again.headers['idempotency-replayed']).toBe('true');
          expect(again.body).toEqual(done.body);
          const back = await doc(a._id);
          expect(back).toMatchObject({ state: 'Active', leaderId: y.id, currentPrice: held.currentPrice, heldAt: held.heldAt });
          expect(back.resumedAt).not.toBeNull();
          for (const k of ['startAt', 'endAt', 'plannedEndAt', 'biddingOpenedAt', 'buyNowAt'] as const)
            expect(back[k]).toEqual(held[k]);
          expect(await wallet(y)).toMatchObject({ auctionHeld: money.auctionHeld });
          for (const m of [seller, x, y]) expect(await kinds(m, a._id)).toContain('AuctionResumed');
          const queue = await call('get', '/operations/auctions', admin).expect(200);
          validates('OperationsAuctionList', queue.body);
          expect(queue.body.items.find((i: { id: string }) => i.id === a._id)).toMatchObject({
            state: 'Active',
            resumedAt: back.resumedAt!.toISOString(),
          });
          // Bidding continues on the same clock.
          await bid(a._id, x, 300_000).expect(200);
          // A second hold is recorded (not replayed), but only a cancel or the
          // 48 h ceiling can end it.
          await db.setStatus(seller.id, 'LOCKED');
          await app.get(AuctionWorker).tick();
          const second = await doc(a._id);
          expect(second.state).toBe('OnHold');
          expect(second.heldAt!.getTime()).toBeGreaterThan(held.heldAt!.getTime());
          await db.setStatus(seller.id, 'ACTIVE');
          expect((await resume(a._id, admin, second.version).expect(409)).body.message).toMatch(/một lần/);
          await tickAt(new Date(second.heldAt!.getTime() + 48 * H));
          expect(await doc(a._id)).toMatchObject({ state: 'Cancelled', closeReason: 'HoldExpired', winnerId: null });
          await noHolds(x, y, ...fillers);
        });

        it('ADR 0083: members read the Admin resume reason in the notification', async () => {
          const { seller, a, x, y } = await heldAuction();
          await db.setStatus(seller.id, 'LOCKED');
          await app.get(AuctionWorker).tick();
          const held = await doc(a._id);
          await db.setStatus(seller.id, 'ACTIVE');
          const reason = 'Người bán đã xác minh lại giấy tờ với quản trị viên.';
          await resume(a._id, admin, held.version, undefined, reason).expect(200);
          for (const m of [seller, x, y]) {
            const n = await db.c.member_notifications.findOne({ userId: m.id, targetId: a._id, kind: 'AuctionResumed' });
            expect(n!.body).toContain(`Lời nhắn của quản trị viên: “${reason}”`);
            expect([...n!.body].length).toBeLessThanOrEqual(400);
          }
        });

        it('a resume after the end lets the worker close it; the close that held it is not replayed', async () => {
          const { a, x, y } = await heldAuction();
          const open = await doc(a._id);
          await db.setStatus(y.id, 'RESTRICTED');
          await tickAt(open.endAt);
          const held = await doc(a._id);
          expect(held).toMatchObject({ state: 'OnHold', orderId: null, leaderId: y.id });
          await db.setStatus(y.id, 'ACTIVE');
          for (const m of [admin, x]) await longSession(m);
          pinClock(new Date(open.endAt.getTime() + H));
          try {
            await resume(a._id, admin, held.version).expect(200);
            // The end already passed: nobody bids, the worker closes next.
            expect((await bid(a._id, x, 300_000).expect(409)).body.code).toBe('AuctionClosed');
          } finally {
            vi.restoreAllMocks();
          }
          await tickAt(new Date(open.endAt.getTime() + H + 60_000));
          const closed = await doc(a._id);
          expect(closed).toMatchObject({ state: 'AwaitingWinnerPayment', winnerId: y.id, finalPrice: 250_000 });
          expect(closed.paymentDeadline!.getTime()).toBe(open.endAt.getTime() + 24 * H);
          expect(await db.c.point_orders.countDocuments({ _id: closed.orderId! })).toBe(1);
          expect(
            await db.c.mutation_receipts.countDocuments({
              operation: 'closeAuction',
              key: { $in: [stepKey(a._id, open.version, 'close'), stepKey(a._id, held.version + 1, 'close')] },
            }),
          ).toBe(2);
        });

        it('refuses a resume once the 48 h hold ceiling passed; the worker cancels instead', async () => {
          const { seller, a, x, y, fillers } = await heldAuction();
          await db.setStatus(seller.id, 'LOCKED');
          await app.get(AuctionWorker).tick();
          const held = await doc(a._id);
          await db.setStatus(seller.id, 'ACTIVE');
          await longSession(admin);
          const ceiling = new Date(held.heldAt!.getTime() + 48 * H);
          pinClock(ceiling);
          try {
            expect((await resume(a._id, admin, held.version).expect(409)).body.message).toMatch(/48 giờ/);
          } finally {
            vi.restoreAllMocks();
          }
          await tickAt(ceiling);
          expect(await doc(a._id)).toMatchObject({ state: 'Cancelled', closeReason: 'HoldExpired' });
          await noHolds(x, y, ...fillers);
        });

        it('the Admin close from a report reaches live watchers right after the commit', async () => {
          const { a, y } = await heldAuction();
          const flagged = await cmd('post', '/me/support-cases', {
            kind: 'Violation',
            title: 'Nghi ngờ trả giá gian lận: phiên thử',
            description: 'Một tài khoản lạ liên tục đẩy giá phiên này.',
            target: { type: 'Auction', id: a._id },
          }, y).expect(200);
          const caseId = flagged.body.entityId as string;
          await cmd('post', `/operations/support-cases/${caseId}/actions`, { expectedVersion: 1, action: 'Assign', text: 'Admin đã nhận hồ sơ.' }, admin).expect(200);
          const { port } = app.getHttpServer().address() as { port: number };
          const watcher = await new Promise<Socket>((resolve, reject) => {
            const s = io(`http://127.0.0.1:${port}/auctions`, { transports: ['websocket'], forceNew: true, reconnection: false });
            s.once('connect', () => resolve(s));
            s.once('connect_error', reject);
          });
          try {
            const updates: { auction: { state: string; closeReason?: string | null } }[] = [];
            watcher.on('auction:update', (u: (typeof updates)[number]) => updates.push(u));
            expect((await watcher.emitWithAck('auction:watch', a._id)).ok).toBe(true);
            const nudge = vi.spyOn(app.get(AuctionLiveService), 'nudge');
            await cmd('post', `/operations/support-cases/${caseId}/close-auction`, {
              expectedVersion: 2,
              auctionVersion: await v(a._id),
              message: 'Phiên có dấu hiệu đẩy giá bằng tài khoản phụ.',
            }, admin).expect(200);
            expect(nudge).toHaveBeenCalled();
            nudge.mockRestore();
            const until = Date.now() + 8000;
            while (!updates.some((u) => u.auction.state === 'Cancelled')) {
              if (Date.now() > until) throw new Error('Timed out waiting for push');
              await new Promise((r) => setTimeout(r, 50));
            }
            for (const u of updates) validates('PublicAuction', u);
            expect(updates.at(-1)!.auction).toMatchObject({ state: 'Cancelled', closeReason: 'Reported' });
          } finally {
            watcher.disconnect();
          }
        });
      });
    });

    // ADR 0078: the seller and members who registered or bid flag the auction to Admin.
    describe('ADR 0078: auction flags', () => {
      const flag = (auctionId: string, a: Actor, kind = 'TransactionIssue', key?: string) =>
        cmd('post', '/me/support-cases', {
          kind,
          title: 'Tiền cọc, khoản giữ hoặc thanh toán: phiên thử',
          description: 'Khoản giữ trong ví không khớp với giá tôi đang dẫn.',
          target: { type: 'Auction', id: auctionId },
        }, a, key);
      const mine = async (auctionId: string, a: Actor) =>
        (await call('get', `/me/support-cases?targetType=Auction&targetId=${auctionId}`, a).expect(200)).body as { items: { id: string; state: string }[] };
      const act = (id: string, version: number, action: string, who: Actor) =>
        cmd('post', `/operations/support-cases/${id}/actions`, { expectedVersion: version, action, text: 'Admin đã đối chiếu phiên.' }, who);

      it('ADR 0083: Admin sees how many other reports are open on the same auction and lists them together; members never do', async () => {
        const { a } = await liveOf();
        const [x, y] = [await funded(500_000), await funded(500_000)];
        await fill(a._id, x, y);
        const first = (await flag(a._id, x).expect(200)).body.entityId as string;
        const second = (await flag(a._id, y).expect(200)).body.entityId as string;
        const other = await liveOf();
        const z = await funded(500_000);
        await register(other.a._id, z).expect(200);
        const elsewhere = (await flag(other.a._id, z).expect(200)).body.entityId as string;
        const queue = await call('get', '/operations/support-cases?limit=50', admin).expect(200);
        validates('SupportCasePage', queue.body);
        const item = (id: string) => queue.body.items.find((i: { id: string }) => i.id === id);
        expect(item(first)).toMatchObject({ otherOpenOnTarget: 1 });
        expect(item(second)).toMatchObject({ otherOpenOnTarget: 1 });
        expect(item(elsewhere)).toMatchObject({ otherOpenOnTarget: 0 });
        const grouped = await call('get', `/operations/support-cases?targetType=Auction&targetId=${a._id}`, admin).expect(200);
        validates('SupportCasePage', grouped.body);
        expect(grouped.body.items.map((i: { id: string }) => i.id).sort()).toEqual([first, second].sort());
        const detail = await call('get', `/operations/support-cases/${first}`, admin).expect(200);
        validates('SupportCaseDetail', detail.body);
        expect(detail.body.case.otherOpenOnTarget).toBe(1);
        // A reporter never learns whether anyone else reported.
        const own = await mine(a._id, x);
        expect(own.items).toHaveLength(1);
        expect(own.items[0]).not.toHaveProperty('otherOpenOnTarget');
        const ownDetail = await call('get', `/me/support-cases/${first}`, x).expect(200);
        expect(ownDetail.body.case).not.toHaveProperty('otherOpenOnTarget');
      });

      it('seller, registrant and bidder flag it; Admin sees the auction state; nothing else moves', async () => {
        const { seller, a } = await liveOf();
        const [x, y] = [await funded(500_000), await funded(500_000)];
        const fillers = await fill(a._id, x, y);
        await bid(a._id, y, 200_000).expect(200);
        const before = { auction: await db.c.auctions.findOne({ _id: a._id }), x: await wallet(x), y: await wallet(y) };
        const ids: string[] = [];
        for (const who of [seller, x, y]) {
          const r = await flag(a._id, who).expect(200);
          validates('SupportCaseReceipt', r.body);
          ids.push(r.body.entityId);
        }
        // Everyone with a stake is involved, whoever filed it.
        const row = await db.c.support_cases.findOne({ _id: ids[1] });
        expect([...row!.involvedUserIds].sort()).toEqual([seller.id, x.id, y.id, ...fillers.map((f) => f.id)].sort());
        // The member finds their own flag on this auction only.
        const list = await mine(a._id, x);
        validates('SupportCasePage', list);
        expect(list.items.map((i) => i.id)).toEqual([ids[1]]);
        const other = await liveOf();
        expect((await mine(other.a._id, x)).items).toEqual([]);
        const detail = await call('get', `/operations/support-cases/${ids[2]}`, admin).expect(200);
        validates('SupportCaseDetail', detail.body);
        expect(detail.body).toMatchObject({ relatedState: 'Active', relatedAuctionId: a._id });
        // A flag never pauses the auction or moves money.
        const after = await db.c.auctions.findOne({ _id: a._id });
        expect(after).toMatchObject({ state: 'Active', version: before.auction!.version });
        const money = (w: { available: number; auctionHeld: number }) => ({ available: w.available, auctionHeld: w.auctionHeld });
        expect(money(await wallet(x))).toEqual(money(before.x));
        expect(money(await wallet(y))).toEqual(money(before.y));
      });

      it('unhappy: an outsider cannot raise a money issue, one open flag per member, closed allows a new one', async () => {
        const { a } = await liveOf();
        const x = await funded(100_000);
        await register(a._id, x).expect(200);
        const outsider = await actor();
        const refused = await flag(a._id, outsider).expect(422);
        expect(refused.body.fieldErrors[0].message).toMatch(/Chỉ người bán/);
        // Anyone may still report a violation on a public auction.
        await flag(a._id, outsider, 'Violation').expect(200);
        const first = await flag(a._id, x).expect(200);
        const dup = await flag(a._id, x, 'Bug').expect(409);
        expect(dup.body.message).toContain(first.body.entityId.slice(0, 8).toUpperCase());
        expect(await db.c.support_cases.countDocuments({ reporterId: x.id, 'target.id': a._id })).toBe(1);
        const id = first.body.entityId as string;
        await act(id, 1, 'Assign', admin).expect(200);
        await act(id, 2, 'Answer', admin).expect(200);
        await act(id, 3, 'Close', admin).expect(200);
        await flag(a._id, x, 'Bug').expect(200);
        // A missing auction is not found.
        await flag(randomUUID(), x).expect(404);
      });

      it('an Admin who registered or bid cannot read or handle the flag, even one filed earlier', async () => {
        const { a } = await liveOf();
        const x = await funded(100_000);
        await register(a._id, x).expect(200);
        const early = (await flag(a._id, x).expect(200)).body.entityId as string;
        const adminMember = await actor(['ADMIN', 'MEMBER']);
        await fund(adminMember, 100_000);
        await register(a._id, adminMember).expect(200);
        expect((await call('get', `/operations/support-cases/${early}`, adminMember).expect(403)).body.code).toBe('SelfReviewForbidden');
        expect((await act(early, 1, 'Assign', adminMember).expect(403)).body.code).toBe('SelfReviewForbidden');
        // A flag filed after they joined lists them as involved: not in their queue.
        const y = await funded(100_000);
        await register(a._id, y).expect(200);
        const late = (await flag(a._id, y).expect(200)).body.entityId as string;
        const queue = (await call('get', '/operations/support-cases?limit=50', adminMember).expect(200)).body as { items: { id: string }[] };
        expect(queue.items.map((i) => i.id)).not.toContain(late);
        // An independent Admin still handles both.
        await act(early, 1, 'Assign', admin).expect(200);
        await call('get', `/operations/support-cases/${late}`, admin).expect(200);
      });

      it('replay returns the same receipt; two keys at once create one open flag', async () => {
        const { a } = await liveOf();
        const [x, y] = [await funded(100_000), await funded(100_000)];
        await register(a._id, x).expect(200);
        await register(a._id, y).expect(200);
        const key = randomUUID();
        const r1 = await flag(a._id, x, 'TransactionIssue', key).expect(200);
        const r2 = await flag(a._id, x, 'TransactionIssue', key).expect(200);
        expect(r2.headers['idempotency-replayed']).toBe('true');
        expect(r2.body).toEqual(r1.body);
        const raced = await Promise.all([flag(a._id, y), flag(a._id, y, 'Bug')]);
        expect(raced.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(await db.c.support_cases.countDocuments({ 'target.id': a._id })).toBe(2);
      });
    });
  });
});
