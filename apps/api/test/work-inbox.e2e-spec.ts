import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { validates } from './helpers/contract.js';
import type { Wire } from '../src/modules/commands/domain-error.js';
import type {
  DirectOrderDoc,
  AuctionIntakeDoc,
  PointOrderDoc,
  ExchangeDoc,
  ListingDoc,
  RoleCode,
} from '../src/database/mongo/documents.js';
import { AUCTION_DROPOFF_MS } from '../src/database/mongo/migrations/auction-constants.js';

type Reader = { id: string; token: string; sessionId: string };
describe('work inbox — HTTP and Mongo snapshot', () => {
  let app: INestApplication, db: MongoFixtures, a: Reader, b: Reader;
  const future = new Date(Date.now() + 14 * 60000),
    now = new Date();
  async function user(roles: RoleCode[] = ['MEMBER']): Promise<Reader> {
    const row = await db.user({ roles }),
      sid = await db.session(row._id);
    return {
      id: row._id,
      sessionId: sid,
      token: await app.get(JwtService).signAsync({ sub: row._id, sid }),
    };
  }
  const get = (path: string, actor?: Reader) => {
    const r = request(app.getHttpServer()).get('/api/v1' + path);
    return actor ? r.set('Authorization', 'Bearer ' + actor.token) : r;
  };
  async function order(overrides: Partial<DirectOrderDoc> = {}) {
    const deadline = overrides.paymentDeadline ?? future;
    const row: DirectOrderDoc = {
      _id: randomUUID(),
      buyerId: a.id,
      sellerId: b.id,
      quoteId: randomUUID(),
      version: 1,
      state: 'AwaitingPayment',
      createdAt: new Date(+deadline - 15 * 60000),
      paymentDeadline: deadline,
      closedAt: null,
      paidAt: null,
      sellerConfirmationDeadline: null,
      cancellationRequestedAt: null,
      cancellationReason: null,
      deliveredAt: null,
      inspectionDeadline: null,
      completedAt: null,
      lockSeq: 0,
      ...overrides,
    };
    await db.c.direct_orders.insertOne(row);
    return row._id;
  }
  async function listing(
    ownerId: string,
    moderation: ListingDoc['moderation'] = 'Draft',
  ) {
    const id = randomUUID(),
      revisionId = randomUUID();
    await db.c.listings.insertOne({
      _id: id,
      ownerId,
      version: 1,
      channel: 'Marketplace',
      moderation,
      visibility: 'Visible',
      trade: 'Available',
      currentRevisionId: revisionId,
      removalReason: null,
      deletedAt: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    await db.c.listing_revisions.insertOne({
      _id: revisionId,
      listingId: id,
      number: 1,
      bookId: randomUUID(),
      mode: 'Sale',
      condition: 'Good',
      pages: 'Đủ trang',
      coverNote: 'Bìa còn nguyên',
      notes: 'Không ghi chú',
      accessories: 'Không kèm phụ kiện',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      description: 'Sách kiểm thử chỉ dùng trong database QA riêng.',
      salePrice: 50000,
      exchangeValue: null,
      submittedAt: moderation === 'PendingReview' ? now : null,
      ownershipDeclaredAt: now,
      createdAt: now,
      originAddressId: null,
      originAddressVersion: null,
      originServiceAreaCode: null,
      lockSeq: 0,
    });
    return id;
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
  }, 60000);
  beforeEach(async () => {
    a = await user();
    b = await user();
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('paginates every obligation beyond 50 with equal timestamps; hides outsiders, terminals and internal fields', async () => {
    const expected = new Set<string>();
    for (let i = 0; i < 57; i++) expected.add(await order());
    await order({
      state: 'Cancelled',
      version: 2,
      closedAt: new Date(+future - 1000),
    });
    await order({ buyerId: (await user()).id });
    const found: string[] = [];
    let cursor: string | null = null;
    do {
      const response: { body: Wire['WorkItemsPage'] } = await get(
        '/me/work-items?limit=13' +
          (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
        a,
      ).expect(200);
      validates('WorkItemsPage', response.body);
      for (const item of response.body.items) {
        found.push(item.id);
        expect(item.target).toBe('DirectOrder');
        expect(item.attention).toBe('Action');
        expect(Object.keys(item).sort()).toEqual([
          'attention',
          'dueAt',
          'id',
          'reason',
          'sourceState',
          'target',
          'targetId',
          'title',
          'version',
        ]);
      }
      cursor = response.body.nextCursor;
    } while (cursor);
    expect(found).toHaveLength(57);
    expect(new Set(found)).toEqual(expected);
  });
  it('binds signed cursors to actor and lane; validates filters instead of returning a false empty list', async () => {
    await order();
    await order();
    const first = await get('/me/work-items?limit=1', a).expect(200),
      cursor = encodeURIComponent(first.body.nextCursor);
    await get('/me/work-items?cursor=' + cursor, b).expect(400);
    await get('/me/work-items?lane=Listings&cursor=' + cursor, a).expect(400);
    await get('/me/work-items?cursor=' + cursor + 'x', a).expect(400);
    for (const query of [
      'limit=51',
      'limit=0',
      'lane=Unknown',
      'userId=' + b.id,
    ])
      await get('/me/work-items?' + query, a).expect(400);
  });
  it('updates from actual state after action/expiry and never creates commands, money or a persistent task', async () => {
    const id = await order({ paymentDeadline: new Date(Date.now() - 1000) });
    const before = await db.c.mutation_receipts.countDocuments({});
    const response = await get('/me/work-items', a).expect(200);
    expect(response.body.items[0]).toMatchObject({ id, attention: 'Waiting' });
    expect((await db.c.direct_orders.findOne({ _id: id }))?.state).toBe(
      'AwaitingPayment',
    );
    await db.c.direct_orders.updateOne(
      { _id: id },
      {
        $set: { state: 'PaymentExpired', closedAt: new Date() },
        $inc: { version: 1 },
      },
    );
    expect((await get('/me/work-items', a).expect(200)).body.items).toEqual([]);
    expect(await db.c.mutation_receipts.countDocuments({})).toBe(before);
  });
  it('checks current account, session and role on every read including after a cursor was issued', async () => {
    const id = await order();
    await listing(a.id);
    await get('/me/work-items').expect(401);
    await db.setStatus(a.id, 'LOCKED');
    expect(
      (await get('/me/work-items', a).expect(200)).body.items[0],
    ).toMatchObject({ id, attention: 'Blocked' });
    await get('/me/work-items?lane=Listings', a).expect(403);
    await get('/me/work-items?lane=AuctionIntakes', a).expect(403);
    await db.setStatus(a.id, 'RESTRICTED');
    expect(
      (await get('/me/work-items', a).expect(200)).body.items[0].attention,
    ).toBe('Action');
    await db.removeRole(a.id, 'MEMBER');
    await get('/me/work-items', a).expect(403);
    await db.addRole(a.id, 'MEMBER');
    await db.c.auth_sessions.updateOne(
      { _id: a.sessionId },
      { $set: { revokedAt: now }, $inc: { lockSeq: 1 } },
    );
    await get('/me/work-items', a).expect(401);
  });
  it('keeps incoming counteroffers and funded-side waiting distinct; masks a stale disputed state', async () => {
    const row: ExchangeDoc = {
      _id: randomUUID(),
      initiatorId: a.id,
      recipientId: b.id,
      initiatorListingId: randomUUID(),
      recipientListingId: randomUUID(),
      initiatorOrderId: randomUUID(),
      recipientOrderId: randomUUID(),
      status: 'Proposed',
      revision: 2,
      initiatorDeposit: 1,
      recipientDeposit: 1,
      diffAmount: 0,
      diffPayerId: null,
      fundingDeadline: null,
      initiatorFundedAt: null,
      recipientFundedAt: null,
      proposalExpiresAt: future,
      rejectionReason: null,
      cancelReason: null,
      cancelledBy: null,
      cancelledAt: null,
      initiatorShippedAt: null,
      recipientShippedAt: null,
      initiatorReceivedAt: null,
      recipientReceivedAt: null,
      inspectionDeadline: null,
      completedAt: null,
      lastProposedById: b.id,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    };
    await db.c.exchanges.insertOne(row);
    expect(
      (await get('/me/work-items?lane=Exchanges', a).expect(200)).body.items[0]
        .attention,
    ).toBe('Action');
    expect(
      (await get('/me/work-items?lane=Exchanges', b).expect(200)).body.items[0]
        .attention,
    ).toBe('Waiting');
    await db.c.exchanges.updateOne(
      { _id: row._id },
      { $set: { status: 'Delivered', disputedBy: b.id } },
    );
    expect(
      (await get('/me/work-items?lane=Exchanges', a).expect(200)).body.items[0],
    ).toMatchObject({ sourceState: 'ResolutionPending', attention: 'Waiting' });
  });
  it('moderation work excludes self, withdrawn and terminal listings; current Staff/Admin roles stay distinct', async () => {
    const staff = await user(['STAFF', 'MEMBER']),
      admin = await user(['ADMIN', 'MEMBER']),
      tester = await user(['TEST_OPERATOR']);
    const id = await listing(a.id, 'PendingReview');
    await listing(staff.id, 'PendingReview');
    await listing(a.id, 'Rejected');
    await listing(a.id, 'Draft');
    const removed = await listing(a.id, 'PendingReview');
    await db.c.listings.updateOne(
      { _id: removed },
      {
        $set: {
          visibility: 'Removed',
          removalReason: 'QA loại bài đã gỡ khỏi danh sách.',
        },
      },
    );
    const page = await get('/operations/work-items', staff).expect(200);
    validates('WorkItemsPage', page.body);
    expect(page.body.items.map((i: { id: string }) => i.id)).toEqual([id]);
    await get('/operations/work-items', a).expect(403);
    await get('/operations/work-items', tester).expect(403);
    await get('/operations/work-items?lane=CatalogReview', staff).expect(403);
    await get('/operations/work-items?lane=CatalogReview', admin).expect(200);
    await db.setStatus(staff.id, 'RESTRICTED');
    await get('/operations/work-items', staff).expect(403);
    await db.setStatus(staff.id, 'ACTIVE');
    await db.removeRole(staff.id, 'STAFF');
    await get('/operations/work-items', staff).expect(403);
  });
  it('prioritizes a future deadline over overdue work while preserving all pages', async () => {
    const overdue = await order({
      paymentDeadline: new Date(Date.now() - 10000),
    });
    const pending = await order({
      paymentDeadline: new Date(Date.now() + 60000),
    });
    const page = (await get('/me/work-items?limit=1', a).expect(200)).body;
    expect(page.items[0]).toMatchObject({ id: pending, attention: 'Action' });
    const next = (
      await get(
        '/me/work-items?limit=1&cursor=' + encodeURIComponent(page.nextCursor),
        a,
      ).expect(200)
    ).body;
    expect(next.items[0]).toMatchObject({ id: overdue, attention: 'Waiting' });
  });
  it('paginates own auction intakes and winner Orders, never foreign books; targets the exact auction', async () => {
    const createdAt = new Date(),
      intakeId = randomUUID(),
      auctionId = randomUUID();
    const intake: AuctionIntakeDoc = {
      _id: intakeId,
      contextId: randomUUID(),
      listingId: randomUUID(),
      listingRevisionId: randomUUID(),
      sellerId: a.id,
      pointId: randomUUID(),
      slotId: randomUUID(),
      startPrice: 10000,
      step: 10000,
      buyNowPrice: null,
      protectiveValue: 10000,
      policyCode: 'HCM-AUCTION-v1',
      state: 'AwaitingDropoff',
      version: 1,
      createdAt,
      dropoffDeadline: new Date(+createdAt + AUCTION_DROPOFF_MS),
      receivedAt: null,
      receivedBy: null,
      shelfCode: null,
      inspectedAt: null,
      inspectorId: null,
      inspectionOutcome: null,
      inspectionNote: null,
      evidenceRequestedBy: null,
      evidenceDeadline: null,
      evidenceNote: null,
      evidenceSubmittedAt: null,
      reclaimRequiredAt: null,
      auctionId: null,
      reclaimReason: null,
      closedAt: null,
      updatedAt: createdAt,
      lockSeq: 0,
    };
    await db.c.auction_intakes.insertOne(intake);
    await db.c.auction_intakes.insertOne({
      ...intake,
      _id: randomUUID(),
      contextId: randomUUID(),
      listingId: randomUUID(),
      slotId: randomUUID(),
      sellerId: b.id,
    });
    const intakes = (
      await get('/me/work-items?lane=AuctionIntakes', a).expect(200)
    ).body;
    validates('WorkItemsPage', intakes);
    expect(intakes.items).toHaveLength(1);
    expect(intakes.items[0]).toMatchObject({
      id: intakeId,
      target: 'AuctionIntake',
      attention: 'Action',
    });
    const row: PointOrderDoc = {
      _id: randomUUID(),
      source: 'Auction',
      auctionId,
      intakeId,
      contextId: randomUUID(),
      listingId: intake.listingId,
      buyerId: a.id,
      sellerId: b.id,
      pointId: intake.pointId,
      fulfillmentMethod: 'SelfCollect',
      bookPrice: 10000,
      outboundFee: 0,
      buyerTotal: 10000,
      commissionBps: 500,
      commission: 500,
      sellerProceeds: 9500,
      state: 'AwaitingPayment',
      version: 1,
      createdAt,
      paymentDeadline: new Date(+createdAt + 3600000),
      paidAt: null,
      closedAt: null,
      updatedAt: createdAt,
      acceptanceDeadline: null,
      acceptedAt: null,
      collectionDeadline: null,
      collectedAt: null,
      inspectionDeadline: null,
      resolutionReason: null,
      resolutionNote: null,
      resolutionOpenedAt: null,
      collectionOpenedAt: null,
      returnDeadline: null,
      returnedAt: null,
      dispatchedAt: null,
      deliveryDeadline: null,
      trackingCode: null,
      lockSeq: 0,
    };
    await db.c.point_orders.insertOne(row);
    const page = (await get('/me/work-items?lane=AuctionOrders', a).expect(200))
      .body;
    validates('WorkItemsPage', page);
    expect(page.items[0]).toMatchObject({
      id: row._id,
      target: 'Auction',
      targetId: auctionId,
      attention: 'Action',
    });
    expect(
      (await get('/me/work-items?lane=AuctionOrders', await user()).expect(200))
        .body.items,
    ).toEqual([]);
    await db.setStatus(a.id, 'LOCKED');
    expect(
      (await get('/me/work-items?lane=AuctionOrders', a).expect(200)).body
        .items[0].attention,
    ).toBe('Blocked');
  });
});
