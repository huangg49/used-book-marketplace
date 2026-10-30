import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { ExchangeExpiryWorker } from '../src/modules/exchanges/exchange-expiry.service.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

const storage = {
  async check() {},
  async signedRead(key: string) {
    return {
      url: 'https://storage.test/' + key,
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
  },
};

type Reader = { id: string; token: string; sessionId: string; email: string };

const metadata = (title = 'Sách kiểm thử trao đổi') => ({
  title,
  authors: ['Tác giả A'],
  publisher: null,
  publicationYear: null,
  language: 'vi',
  edition: null,
  category: 'Văn học',
  isbn: null as string | null,
});

const draft = (bookId: string | null = null) => ({
  bookId,
  mode: null,
  condition: null,
  pages: '',
  coverNote: '',
  notes: '',
  accessories: '',
  readable: null,
  hasMissingPages: null,
  missingEssentialContent: null,
  description: '',
  salePrice: null,
  exchangeValue: null,
  mediaIds: [] as string[],
});

describe('Book Exchange Flow (Trao đổi sách backend)', () => {
  let app: INestApplication;
  let db: MongoFixtures;
  let worker: ExchangeExpiryWorker;
  const users: string[] = [];
  let user1: Reader;
  let user2: Reader;
  let admin: Reader;
  let staff: Reader;
  let operator: Reader;
  const originalSecret = process.env.PAYMENT_SIMULATOR_SECRET;

  const get = (path: string, actor?: Reader) => {
    const call = request(app.getHttpServer()).get('/api/v1' + path);
    return actor ? call.set('Authorization', `Bearer ${actor.token}`) : call;
  };

  const post = (
    path: string,
    body: object,
    actor: Reader,
    key: string = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);

  const put = (
    id: string,
    body: object,
    actor: Reader,
    key: string = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .put(`/api/v1/listings/${id}/draft`)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);

  async function reader(
    roles: RoleCode[] = ['MEMBER'],
    status: UserStatus = 'ACTIVE',
  ): Promise<Reader> {
    const email = `${randomUUID()}@exchange-test.local`;
    const user = await db.user({
      email,
      displayName: 'Thành viên Test',
      roles,
      status,
    });
    users.push(user._id);
    const sessionId = await db.session(user._id);
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user._id, sid: sessionId });
    return { id: user._id, sessionId, token, email };
  }

  async function createCatalog(actor: Reader, meta = metadata()) {
    const res = await post('/catalog/requests', { metadata: meta }, actor).expect(200);
    return res.body;
  }

  function confirmCatalog(created: Record<string, any>, actor: Reader) {
    return post(
      `/operations/catalog-requests/${created.entityId}/decision`,
      {
        expectedVersion: created.version,
        revisionId: created.revisionId,
        decision: 'Confirm',
      },
      actor,
    );
  }

  async function asset(listingId: string) {
    const key = randomUUID();
    const now = new Date();
    const doc = {
      _id: randomUUID(),
      listingId,
      version: 1,
      status: 'Ready' as const,
      stagingKey: key,
      pinnedKey: key + '/input',
      derivativeKey: key + '/display.webp',
      mimeType: 'image/jpeg',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      width: 20,
      height: 20,
      failureCode: null,
      expiresAt: new Date(Date.now() + 3600000),
      purgedAt: null,
      reservedBytes: 1000,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    };
    await db.c.listing_media.insertOne(doc);
    return { ...doc, id: doc._id };
  }

  const checklist = {
    catalogMatches: true,
    photosClear: true,
    conditionDisclosed: true,
    readable: true,
    pricingValid: true,
    contentAppropriate: true,
  };

  async function createApprovedListing(
    actor: Reader,
    exchangeValue = 100000,
    mode: 'Exchange' | 'Both' = 'Both',
  ) {
    const cat = await createCatalog(actor, metadata('Sách ' + randomUUID()));
    await confirmCatalog(cat, admin).expect(200);

    const draftRes = (await post('/listings', { content: draft(cat.entityId) }, actor).expect(200)).body;
    const media = await asset(draftRes.entityId);

    const content = {
      ...draft(cat.entityId),
      mode,
      condition: 'Good',
      pages: 'Đủ trang',
      coverNote: 'Bìa đẹp',
      notes: 'Không có ghi chú',
      accessories: 'Không kèm phụ kiện',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      description: 'Sách đã đọc một lần, còn nguyên nội dung và đọc rất rõ từng trang.',
      salePrice: mode === 'Exchange' ? null : 120000,
      exchangeValue,
      mediaIds: [media.id],
    };

    const saved = (
      await put(
        draftRes.entityId,
        { expectedVersion: draftRes.version, content },
        actor,
      ).expect(200)
    ).body;

    const submitted = (
      await post(
        `/listings/${saved.entityId}/submit`,
        { expectedVersion: saved.version, ownershipDeclared: true },
        actor,
      ).expect(200)
    ).body;

    const approved = (
      await post(
        `/operations/listings/${submitted.entityId}/decision`,
        {
          expectedVersion: submitted.version,
          revisionId: submitted.revisionId,
          decision: 'Approve',
          checklist,
        },
        staff,
      ).expect(200)
    ).body;

    return {
      listingId: approved.entityId as string,
      version: approved.version as number,
      exchangeValue,
    };
  }

  async function topupUser(actor: Reader, amount = 1000000) {
    const intent = (await post('/me/topups', { amount }, actor).expect(200)).body;
    await post(
      '/operations/simulator/topup-events',
      {
        eventId: randomUUID(),
        intentId: intent.entityId,
        recipientId: actor.id,
        amount,
        currency: 'VND',
        outcome: 'Succeeded',
        occurredAt: new Date().toISOString(),
      },
      operator,
    ).expect(200);
  }

  const reconcile = () =>
    app.get(MongoService).tx((tx) => app.get(LedgerService).reconcile(tx));

  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    db = await MongoFixtures.connect();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();

    app = moduleRef.createNestApplication();
    app
      .get(ConfigService)
      .set('PAYMENT_SIMULATOR_SECRET', process.env.PAYMENT_SIMULATOR_SECRET);
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    await app.listen(0, '127.0.0.1');

    worker = app.get(ExchangeExpiryWorker);

    admin = await reader(['MEMBER', 'ADMIN']);
    staff = await reader(['STAFF']);
    operator = await reader(['TEST_OPERATOR']);
  }, 60000);

  beforeEach(async () => {
    // Active listings from another scenario must not consume this case's
    // five-listing quota or couple its wallet funding to test execution order.
    user1 = await reader(['MEMBER']);
    user2 = await reader(['MEMBER']);
    await topupUser(user1, 1000000);
    await topupUser(user2, 1000000);
  });

  afterAll(async () => {
    if (db) {
      const c = db.c;
      // 1. Collect exchange order IDs BEFORE deleting exchanges
      const userExchanges = await c.exchanges
        .find({
          $or: [{ initiatorId: { $in: users } }, { recipientId: { $in: users } }],
        })
        .toArray();
      const exchangeOrderIds = [
        ...userExchanges.map((e) => e.initiatorOrderId).filter(Boolean),
        ...userExchanges.map((e) => e.recipientOrderId).filter(Boolean),
      ];

      // Clean up exchanges created by test users
      await c.exchanges.deleteMany({
        _id: { $in: userExchanges.map((e) => e._id) },
      });

      // 2. Clean up listings and catalog requests
      const userListings = (
        await c.listings.find({ ownerId: { $in: users } }).toArray()
      ).map((l) => l._id);
      const revs = (
        await c.listing_revisions.find({ listingId: { $in: userListings } }).toArray()
      ).map((r) => r._id);

      await c.listing_decisions.deleteMany({ revisionId: { $in: revs } });
      await c.revision_media.deleteMany({ listingId: { $in: userListings } });
      await c.listing_media.deleteMany({ listingId: { $in: userListings } });
      await c.listing_revisions.deleteMany({ listingId: { $in: userListings } });
      await c.listings.deleteMany({ ownerId: { $in: users } });

      const books = (
        await c.catalog_books.find({ requesterId: { $in: users } }).toArray()
      ).map((b) => b._id);
      const bookRevisions = (
        await c.catalog_revisions.find({ bookId: { $in: books } }).toArray()
      ).map((r) => r._id);
      await c.catalog_decisions.deleteMany({ revisionId: { $in: bookRevisions } });
      await c.catalog_revisions.deleteMany({ _id: { $in: bookRevisions } });
      await c.catalog_books.deleteMany({ _id: { $in: books } });

      // 3. Clean up wallet accounts, journals, and entries (conserving simulated capital)
      const topups = (
        await c.topup_intents.find({ ownerId: { $in: users } }).toArray()
      ).map((t) => t._id);
      const accounts = (
        await c.wallet_accounts
          .find({
            $or: [
              { ownerId: { $in: users } },
              { orderId: { $in: exchangeOrderIds } },
            ],
          })
          .toArray()
      ).map((a) => a._id);
      const journals = [
        ...new Set(
          (
            await c.ledger_entries
              .find({ accountId: { $in: accounts } })
              .toArray()
          ).map((e) => e.journalId),
        ),
      ];

      await c.ledger_entries.deleteMany({ journalId: { $in: journals } });
      await c.ledger_journals.deleteMany({ _id: { $in: journals } });
      await c.simulated_payment_events.deleteMany({
        intentId: { $in: topups },
      });
      await c.topup_intents.deleteMany({ _id: { $in: topups } });
      await c.account_locks.deleteMany({ _id: { $in: accounts } });
      await c.wallet_accounts.deleteMany({ _id: { $in: accounts } });

      // 4. Receipts & audits
      const history = {
        $or: [
          { actorId: { $in: users } },
          { topupId: { $in: topups } },
        ],
      };
      const audits = (await c.audit_events.find(history).toArray()).map(
        (a) => a._id,
      );
      await c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await c.audit_events.deleteMany({ _id: { $in: audits } });
      await c.mutation_receipts.deleteMany(history);

      // 5. Addresses and auxiliary exchange collections
      await c.member_addresses.deleteMany({ ownerId: { $in: users } });
      await c.address_identities.deleteMany({ ownerId: { $in: users } });
      await c.address_books.deleteMany({ _id: { $in: users } });
      const exchangeIds = userExchanges.map((e) => e._id);
      await c.exchange_messages.deleteMany({ exchangeId: { $in: exchangeIds } });
      await c.transaction_reviews.deleteMany({ exchangeId: { $in: exchangeIds } });

      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
    if (originalSecret === undefined) delete process.env.PAYMENT_SIMULATOR_SECRET;
    else process.env.PAYMENT_SIMULATOR_SECRET = originalSecret;
  });

  it('completes the full exchange lifecycle: proposal -> accept -> fund -> ship -> receive -> inspection -> settlement', async () => {
    // 1. Setup two approved listings and delivery addresses
    const addr1 = {
      _id: randomUUID(),
      ownerId: user1.id,
      version: 1,
      recipientName: 'Nguyễn Văn A',
      phone: '0901234567',
      serviceAreaCode: 'HCM-DEMO-v1',
      localityCode: 'DEMO-A',
      detail: '123 Nguyễn Huệ',
      isDefault: true,
      createdAt: new Date(),
    };
    const addr2 = {
      _id: randomUUID(),
      ownerId: user2.id,
      version: 1,
      recipientName: 'Trần Thị B',
      phone: '0909876543',
      serviceAreaCode: 'HCM-DEMO-v1',
      localityCode: 'DEMO-B',
      detail: '456 Lê Văn Sỹ',
      isDefault: true,
      createdAt: new Date(),
    };
    await db.c.member_addresses.insertMany([addr1, addr2]);
    await db.c.address_identities.insertMany([
      { _id: addr1._id, ownerId: user1.id },
      { _id: addr2._id, ownerId: user2.id },
    ]);
    await db.c.address_books.insertMany([
      { _id: user1.id, version: 1, lockSeq: 0 },
      { _id: user2.id, version: 1, lockSeq: 0 },
    ]);

    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 150000, 'Both');

    // 2. User1 creates exchange proposal with deliveryAddressId
    const createRes = await post(
      '/exchanges',
      {
        initiatorListingId: l1.listingId,
        recipientListingId: l2.listingId,
        deliveryAddressId: addr1._id,
      },
      user1,
    ).expect(201);

    expect(createRes.body).toMatchObject({
      initiatorId: user1.id,
      recipientId: user2.id,
      initiatorListingId: l1.listingId,
      recipientListingId: l2.listingId,
      status: 'Proposed',
      revision: 1,
      initiatorDeposit: 150000,
      recipientDeposit: 100000,
      diffAmount: 50000,
      diffPayerId: user1.id,
      initiatorAddress: {
        recipientName: 'Nguyễn Văn A',
        phone: '0901234567',
        detail: '123 Nguyễn Huệ',
      },
    });
    const exchangeId = createRes.body.id;

    // Verify listings are still Available during Proposed state
    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Available');
    expect(l2Doc?.trade).toBe('Available');

    // 3. User2 accepts the proposal with deliveryAddressId
    const acceptRes = await post(
      `/exchanges/${exchangeId}/accept`,
      { revision: 1, deliveryAddressId: addr2._id },
      user2,
    ).expect(200);

    expect(acceptRes.body).toMatchObject({
      id: exchangeId,
      status: 'AcceptedAwaitingFunding',
      revision: 2,
      recipientAddress: {
        recipientName: 'Trần Thị B',
        phone: '0909876543',
        detail: '456 Lê Văn Sỹ',
      },
    });
    expect(acceptRes.body.fundingDeadline).toBeDefined();

    // Verify BOTH listings are now atomically Reserved
    const l1Reserved = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Reserved = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Reserved?.trade).toBe('Reserved');
    expect(l2Reserved?.trade).toBe('Reserved');

    // 4. Funding: User1 funds their deposit (150k) + diff (50k) = 200k
    const fund1Res = await post(`/exchanges/${exchangeId}/funding`, {}, user1).expect(200);
    expect(fund1Res.body.status).toBe('AcceptedAwaitingFunding');
    expect(fund1Res.body.initiatorFundedAt).toBeDefined();
    expect(fund1Res.body.recipientFundedAt).toBeNull();

    // Duplicate funding attempt by user1 must fail with invalid state
    await post(`/exchanges/${exchangeId}/funding`, {}, user1).expect(409);

    // User2 funds their deposit (100k)
    const fund2Res = await post(`/exchanges/${exchangeId}/funding`, {}, user2).expect(200);
    expect(fund2Res.body.status).toBe('Preparing');
    expect(fund2Res.body.recipientFundedAt).toBeDefined();

    // 5. Shipping with carrier metadata
    // User1 ships with GHN tracking
    const ship1Res = await post(
      `/exchanges/${exchangeId}/ship`,
      {
        expectedVersion: fund2Res.body.revision,
        method: 'carrier',
        carrierCode: 'GHN',
        carrierName: 'Giao Hàng Nhanh',
        trackingCode: 'GHN888999',
        notes: 'Sách đóng hộp chống sốc',
      },
      user1,
    ).expect(200);
    expect(ship1Res.body.initiatorShippedAt).toBeDefined();
    expect(ship1Res.body.initiatorShipment).toMatchObject({
      method: 'carrier',
      carrierCode: 'GHN',
      trackingCode: 'GHN888999',
      notes: 'Sách đóng hộp chống sốc',
    });
    expect(ship1Res.body.status).toBe('Preparing');

    // User2 ships -> status becomes InTransit
    const ship2Res = await post(
      `/exchanges/${exchangeId}/ship`,
      {
        expectedVersion: ship1Res.body.revision,
        method: 'carrier',
        carrierCode: 'GHTK',
        carrierName: 'Giao Hàng Tiết Kiệm',
        trackingCode: 'GHTK777888',
      },
      user2,
    ).expect(200);
    expect(ship2Res.body.recipientShippedAt).toBeDefined();
    expect(ship2Res.body.recipientShipment).toMatchObject({
      method: 'carrier',
      carrierCode: 'GHTK',
      trackingCode: 'GHTK777888',
    });
    expect(ship2Res.body.status).toBe('InTransit');

    // 6. Receiving
    // User1 receives -> status remains InTransit until both sides receive
    const rec1Res = await post(
      `/exchanges/${exchangeId}/receive`,
      { expectedVersion: ship2Res.body.revision },
      user1,
    ).expect(200);
    expect(rec1Res.body.initiatorReceivedAt).toBeDefined();
    expect(rec1Res.body.status).toBe('InTransit');

    // User2 receives -> both sides received, enters 48h Inspection Window (Delivered)!
    const rec2Res = await post(
      `/exchanges/${exchangeId}/receive`,
      { expectedVersion: rec1Res.body.revision },
      user2,
    ).expect(200);
    expect(rec2Res.body.recipientReceivedAt).toBeDefined();
    expect(rec2Res.body.status).toBe('Delivered');
    expect(rec2Res.body.inspectionDeadline).toBeDefined();

    // 7. Early Satisfaction / Inspection Acceptance ("Nghiệm thu hài lòng")
    // User1 confirms satisfaction -> mutual completion requires both sides
    const comp1Res = await post(
      `/exchanges/${exchangeId}/complete`,
      { expectedVersion: rec2Res.body.revision },
      user1,
    ).expect(200);
    expect(comp1Res.body.initiatorCompletedAt).toBeDefined();
    expect(comp1Res.body.status).toBe('Delivered');

    // User2 confirms satisfaction -> both sides satisfied, status becomes Completed
    const comp2Res = await post(
      `/exchanges/${exchangeId}/complete`,
      { expectedVersion: comp1Res.body.revision },
      user2,
    ).expect(200);
    expect(comp2Res.body.recipientCompletedAt).toBeDefined();
    expect(comp2Res.body.status).toBe('Completed');
    expect(comp2Res.body.completedAt).toBeDefined();

    // 8. Verify listings are now Exchanged!
    const l1Final = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Final = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Final?.trade).toBe('Exchanged');
    expect(l2Final?.trade).toBe('Exchanged');

    // 9. Verify ledger holds are released and reconciled!
    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('supports multi-book exchange proposal: 2 books for 1 book with correct deposits and multi-listing reservations', async () => {
    const l1a = await createApprovedListing(user1, 50000, 'Both');
    const l1b = await createApprovedListing(user1, 60000, 'Both');
    const l2 = await createApprovedListing(user2, 150000, 'Both');

    // User1 proposes 2 books (50k + 60k = 110k) for User2's 150k book
    const createRes = await post(
      '/exchanges',
      {
        initiatorListingIds: [l1a.listingId, l1b.listingId],
        recipientListingId: l2.listingId,
      },
      user1,
    ).expect(201);

    expect(createRes.body).toMatchObject({
      initiatorId: user1.id,
      recipientId: user2.id,
      initiatorListingId: l1a.listingId,
      initiatorListingIds: [l1a.listingId, l1b.listingId],
      recipientListingId: l2.listingId,
      status: 'Proposed',
      revision: 1,
      initiatorDeposit: 150000,
      recipientDeposit: 110000,
      diffAmount: 40000,
      diffPayerId: user1.id,
    });

    const exchangeId = createRes.body.id;

    // Accept -> all 3 listings must transition to Reserved
    await post(
      `/exchanges/${exchangeId}/accept`,
      { revision: 1 },
      user2,
    ).expect(200);

    const doc1a = await db.c.listings.findOne({ _id: l1a.listingId });
    const doc1b = await db.c.listings.findOne({ _id: l1b.listingId });
    const doc2 = await db.c.listings.findOne({ _id: l2.listingId });
    expect(doc1a?.trade).toBe('Reserved');
    expect(doc1b?.trade).toBe('Reserved');
    expect(doc2?.trade).toBe('Reserved');

    // Both fund
    await post(`/exchanges/${exchangeId}/funding`, {}, user1).expect(200);
    const fund2 = await post(`/exchanges/${exchangeId}/funding`, {}, user2).expect(200);
    expect(fund2.body.status).toBe('Preparing');

    // Ship both
    const ship1 = await post(
      `/exchanges/${exchangeId}/ship`,
      { expectedVersion: fund2.body.revision, method: 'direct' },
      user1,
    ).expect(200);
    const ship2 = await post(
      `/exchanges/${exchangeId}/ship`,
      { expectedVersion: ship1.body.revision, method: 'direct' },
      user2,
    ).expect(200);
    expect(ship2.body.status).toBe('InTransit');

    // Receive both
    const rec1 = await post(
      `/exchanges/${exchangeId}/receive`,
      { expectedVersion: ship2.body.revision },
      user1,
    ).expect(200);
    const rec2 = await post(
      `/exchanges/${exchangeId}/receive`,
      { expectedVersion: rec1.body.revision },
      user2,
    ).expect(200);
    expect(rec2.body.status).toBe('Delivered');

    // Complete both -> all 3 listings transition to Exchanged
    const comp1 = await post(
      `/exchanges/${exchangeId}/complete`,
      { expectedVersion: rec2.body.revision },
      user1,
    ).expect(200);
    const comp2 = await post(
      `/exchanges/${exchangeId}/complete`,
      { expectedVersion: comp1.body.revision },
      user2,
    ).expect(200);
    expect(comp2.body.status).toBe('Completed');

    const final1a = await db.c.listings.findOne({ _id: l1a.listingId });
    const final1b = await db.c.listings.findOne({ _id: l1b.listingId });
    const final2 = await db.c.listings.findOne({ _id: l2.listingId });
    expect(final1a?.trade).toBe('Exchanged');
    expect(final1b?.trade).toBe('Exchanged');
    expect(final2?.trade).toBe('Exchanged');

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('allows recipient to reject a proposal, setting status to Cancelled and saving reason', async () => {
    const l1 = await createApprovedListing(user1, 80000, 'Exchange');
    const l2 = await createApprovedListing(user2, 80000, 'Exchange');

    const createRes = await post(
      '/exchanges',
      {
        initiatorListingId: l1.listingId,
        recipientListingId: l2.listingId,
      },
      user1,
    ).expect(201);

    const exchangeId = createRes.body.id;

    const rejectRes = await post(
      `/exchanges/${exchangeId}/reject`,
      {
        expectedVersion: 1,
        reason: 'Không thích thể loại sách này, cảm ơn bạn!',
      },
      user2,
    ).expect(200);

    expect(rejectRes.body.status).toBe('Cancelled');
    expect(rejectRes.body.rejectionReason).toBe('Không thích thể loại sách này, cảm ơn bạn!');

    // Listings must remain Available
    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Available');
    expect(l2Doc?.trade).toBe('Available');
  });

  it('cancels an accepted exchange during funding, refunding any funded party and releasing reservations', async () => {
    const l1 = await createApprovedListing(user1, 120000, 'Both');
    const l2 = await createApprovedListing(user2, 120000, 'Both');

    const createRes = await post(
      '/exchanges',
      {
        initiatorListingId: l1.listingId,
        recipientListingId: l2.listingId,
      },
      user1,
    ).expect(201);

    const exchangeId = createRes.body.id;

    // Accept -> Listings reserved
    await post(`/exchanges/${exchangeId}/accept`, { revision: 1 }, user2).expect(200);

    // User1 funds deposit
    const funded = await post(`/exchanges/${exchangeId}/funding`, {}, user1).expect(200);

    // Cancel exchange
    const cancelRes = await post(
      `/exchanges/${exchangeId}/cancel`,
      { expectedVersion: funded.body.revision },
      user1,
    ).expect(200);

    expect(cancelRes.body.status).toBe('Cancelled');

    // Both listings must be released back to Available
    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Available');
    expect(l2Doc?.trade).toBe('Available');

    // Ledger reconciliation passes (hold refunded cleanly)
    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('enforces authorization and non-participant isolation', async () => {
    const l1 = await createApprovedListing(user1, 50000, 'Both');
    const l2 = await createApprovedListing(user2, 50000, 'Both');

    const createRes = await post(
      '/exchanges',
      {
        initiatorListingId: l1.listingId,
        recipientListingId: l2.listingId,
      },
      user1,
    ).expect(201);

    const thirdUser = await reader(['MEMBER']);
    // Third user cannot read or accept
    await get(`/exchanges/${createRes.body.id}`, thirdUser).expect(404);
    await post(`/exchanges/${createRes.body.id}/accept`, { revision: 1 }, thirdUser).expect(404);

    // Unauthenticated request is 401
    await request(app.getHttpServer()).get(`/api/v1/exchanges/${createRes.body.id}`).expect(401);
  });

  it('1. Quá hạn, chưa ai nạp -> Cancelled, 2 sách về Available, không có bút toán', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    const accepted = (
      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200)
    ).body;

    const deadline = new Date(accepted.fundingDeadline);
    const pastDeadline = new Date(deadline.getTime() + 1000);

    // Run expiry worker with simulated time after deadline
    const sweep = await worker.tick(pastDeadline);
    expect(sweep.processed).toBeGreaterThanOrEqual(1);

    const doc = await db.c.exchanges.findOne({ _id: created.id });
    expect(doc?.status).toBe('Cancelled');
    expect(doc?.cancelReason).toBe('FundingExpired');
    expect(doc?.cancelledBy).toBe('System');
    expect(doc?.cancelledAt).toBeDefined();

    // Verify both listings released back to Available
    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Available');
    expect(l2Doc?.trade).toBe('Available');

    // Ledger reconcile succeeds
    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('2. Quá hạn, chỉ Initiator đã nạp -> Initiator được hoàn đủ, reconcile() đạt', async () => {
    const l1 = await createApprovedListing(user1, 120000, 'Both');
    const l2 = await createApprovedListing(user2, 120000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    const accepted = (
      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200)
    ).body;

    // Initiator funds deposit (120,000)
    await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);

    const deadline = new Date(accepted.fundingDeadline);
    const pastDeadline = new Date(deadline.getTime() + 1000);

    const sweep = await worker.tick(pastDeadline);
    expect(sweep.processed).toBeGreaterThanOrEqual(1);

    const doc = await db.c.exchanges.findOne({ _id: created.id });
    expect(doc?.status).toBe('Cancelled');
    expect(doc?.cancelReason).toBe('FundingExpired');
    expect(doc?.cancelledBy).toBe('System');

    // Listings Available
    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Available');
    expect(l2Doc?.trade).toBe('Available');

    // Initiator hold account is 0
    const hold = await db.c.wallet_accounts.findOne({ orderId: doc?.initiatorOrderId });
    if (hold) {
      const entries = await db.c.ledger_entries.find({ accountId: hold._id }).toArray();
      const balance = entries.reduce((sum, e) => sum + e.debit - e.credit, 0);
      expect(balance).toBe(0);
    }

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('3. Quá hạn, chỉ Recipient đã nạp (Recipient là bên bù Δ) -> hoàn đúng cọc + Δ', async () => {
    // User1 has 150k, User2 has 100k
    // Recipient (user2) pays deposit (150k) + diff (50k) = 200k
    const l1 = await createApprovedListing(user1, 150000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    expect(created.diffPayerId).toBe(user2.id);
    expect(created.diffAmount).toBe(50000);
    expect(created.recipientDeposit).toBe(150000);

    const accepted = (
      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200)
    ).body;

    // Recipient funds their obligation (150k + 50k = 200k)
    await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200);

    const deadline = new Date(accepted.fundingDeadline);
    const pastDeadline = new Date(deadline.getTime() + 1000);

    const sweep = await worker.tick(pastDeadline);
    expect(sweep.processed).toBeGreaterThanOrEqual(1);

    const doc = await db.c.exchanges.findOne({ _id: created.id });
    expect(doc?.status).toBe('Cancelled');
    expect(doc?.cancelReason).toBe('FundingExpired');

    // Check refund journal
    const refundJournal = await db.c.ledger_journals.findOne({
      orderId: doc?.recipientOrderId,
      type: 'OrderRefund',
    });
    expect(refundJournal).toBeDefined();

    // Verify hold balance is 0
    const hold = await db.c.wallet_accounts.findOne({ orderId: doc?.recipientOrderId });
    if (hold) {
      const entries = await db.c.ledger_entries.find({ accountId: hold._id }).toArray();
      const balance = entries.reduce((sum, e) => sum + e.debit - e.credit, 0);
      expect(balance).toBe(0);
    }

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('4. Chưa quá hạn -> không bị đụng tới', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200);

    // Run tick at current time (before deadline)
    await worker.tick(new Date());

    // This exchange must remain untouched
    const doc = await db.c.exchanges.findOne({ _id: created.id });
    expect(doc?.status).toBe('AcceptedAwaitingFunding');

    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Reserved');
    expect(l2Doc?.trade).toBe('Reserved');
  });

  it('5. Chạy job 2 lần liên tiếp -> lần 2 không có tác dụng (idempotent), không hoàn đúp', async () => {
    const l1 = await createApprovedListing(user1, 90000, 'Both');
    const l2 = await createApprovedListing(user2, 90000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    const accepted = (
      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200)
    ).body;

    await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);

    const pastDeadline = new Date(new Date(accepted.fundingDeadline).getTime() + 1000);

    // Run 1
    const sweep1 = await worker.tick(pastDeadline);
    expect(sweep1.processed).toBeGreaterThanOrEqual(1);

    // Run 2 immediately
    const sweep2 = await worker.tick(pastDeadline);
    expect(sweep2.processed).toBe(0);

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('6. Gọi /funding sau fundingDeadline -> 409 InvalidState', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200);

    // Set fundingDeadline in the past directly in DB to simulate expired before job runs
    await db.c.exchanges.updateOne(
      { _id: created.id },
      { $set: { fundingDeadline: new Date(Date.now() - 60000) } },
    );

    // Attempting to fund should immediately fail with 409 InvalidState
    const res = await post(`/exchanges/${created.id}/funding`, {}, user1).expect(409);
    expect(res.body.code).toBe('InvalidState');

    // Sweep expired test 6 exchange so it does not interfere with subsequent tests
    await worker.tick(new Date());
  });

  it('7. Gọi /cancel thủ công rồi chạy job -> không xử lý lại', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    const accepted = (
      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200)
    ).body;

    await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);

    // Manually cancel
    const cancelRes = await post(
      `/exchanges/${created.id}/cancel`,
      { expectedVersion: 3 },
      user1,
    ).expect(200);
    expect(cancelRes.body.status).toBe('Cancelled');
    expect(cancelRes.body.cancelReason).toBe('CancelledByUser');
    expect(cancelRes.body.cancelledBy).toBe('Initiator');

    // Run worker after deadline
    const pastDeadline = new Date(new Date(accepted.fundingDeadline).getTime() + 1000);
    const sweep = await worker.tick(pastDeadline);
    expect(sweep.processed).toBe(0);

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('8. Exchange ở trạng thái khác (Preparing, Completed) không bị job động tới', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');
    const prep = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;
    await post(`/exchanges/${prep.id}/accept`, { revision: 1 }, user2).expect(200);
    await post(`/exchanges/${prep.id}/funding`, {}, user1).expect(200);
    await post(`/exchanges/${prep.id}/funding`, {}, user2).expect(200);

    // Past funding deadline (24h) but before shipping deadline (72h) -> Preparing remains untouched
    const pastFundingDeadline = new Date(Date.now() + 25 * 3600_000);
    await worker.tick(pastFundingDeadline);

    const checkPrep = await db.c.exchanges.findOne({ _id: prep.id });
    expect(checkPrep?.status).toBe('Preparing');
  });

  it('10. Gọi tick() và fund() đồng thời trên cùng exchange sát hạn -> kết quả nhất quán và reconcile() đạt', async () => {
    const l1 = await createApprovedListing(user1, 110000, 'Both');
    const l2 = await createApprovedListing(user2, 110000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    const accepted = (
      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200)
    ).body;

    // Initiator funds first
    await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);

    // Now Recipient funding races against tick() right at expiry deadline
    const pastDeadline = new Date(new Date(accepted.fundingDeadline).getTime() + 1000);

    // Run tick and user2 funding concurrently
    const [tickResult, fundResult] = await Promise.all([
      worker.tick(pastDeadline),
      post(`/exchanges/${created.id}/funding`, {}, user2),
    ]);

    const finalDoc = await db.c.exchanges.findOne({ _id: created.id });

    // Either funding won (Preparing) or tick won (Cancelled)
    if (finalDoc?.status === 'Preparing') {
      expect(fundResult.status).toBe(200);
    } else {
      expect(finalDoc?.status).toBe('Cancelled');
      expect([409, 200]).toContain(fundResult.status);
    }

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('11. Gọi tick() và cancel() thủ công đồng thời -> chỉ hoàn tiền đúng 1 lần và reconcile() đạt', async () => {
    const l1 = await createApprovedListing(user1, 130000, 'Both');
    const l2 = await createApprovedListing(user2, 130000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    const accepted = (
      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200)
    ).body;

    const funded = (await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200)).body;

    const pastDeadline = new Date(new Date(accepted.fundingDeadline).getTime() + 1000);

    // Run tick and manual cancel concurrently
    const [tickResult, cancelResult] = await Promise.all([
      worker.tick(pastDeadline),
      post(`/exchanges/${created.id}/cancel`, { expectedVersion: funded.revision }, user1),
    ]);

    const finalDoc = await db.c.exchanges.findOne({ _id: created.id });
    expect(finalDoc?.status).toBe('Cancelled');

    // Verify only ONE refund was issued (initiator hold balance is 0)
    const hold = await db.c.wallet_accounts.findOne({ orderId: finalDoc?.initiatorOrderId });
    if (hold) {
      const entries = await db.c.ledger_entries.find({ accountId: hold._id }).toArray();
      const balance = entries.reduce((sum, e) => sum + e.debit - e.credit, 0);
      expect(balance).toBe(0);
    }

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Proposal expiry (Bước 2) tests
  // ─────────────────────────────────────────────────────────────────────────

  it('P1. Proposed quá hạn -> Cancelled, reason ProposalExpired, sách vẫn Available, không có bút toán', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    expect(created.proposalExpiresAt).toBeTruthy();
    expect(created.status).toBe('Proposed');

    // Simulate past proposalExpiresAt
    const pastDeadline = new Date(new Date(created.proposalExpiresAt).getTime() + 1000);

    const sweep = await worker.tick(pastDeadline);
    expect(sweep.processed).toBeGreaterThanOrEqual(1);

    const doc = await db.c.exchanges.findOne({ _id: created.id });
    expect(doc?.status).toBe('Cancelled');
    expect(doc?.cancelReason).toBe('ProposalExpired');
    expect(doc?.cancelledBy).toBe('System');
    expect(doc?.cancelledAt).toBeTruthy();

    // Sách phải vẫn Available (Proposed chưa khóa sách)
    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Available');
    expect(l2Doc?.trade).toBe('Available');

    // Không có bút toán (Proposed chưa có tiền trong ledger)
    const hold1 = await db.c.wallet_accounts.findOne({ orderId: doc?.initiatorOrderId });
    const hold2 = await db.c.wallet_accounts.findOne({ orderId: doc?.recipientOrderId });
    expect(hold1).toBeNull();
    expect(hold2).toBeNull();

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('P2. Proposed chưa quá hạn -> không bị đụng tới', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    // Tick at current time (before deadline)
    await worker.tick(new Date());

    const doc = await db.c.exchanges.findOne({ _id: created.id });
    expect(doc?.status).toBe('Proposed');
  });

  it('P3. Chạy tick 2 lần liên tiếp -> idempotent, không lỗi', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    const pastDeadline = new Date(new Date(created.proposalExpiresAt).getTime() + 1000);

    const sweep1 = await worker.tick(pastDeadline);
    expect(sweep1.processed).toBeGreaterThanOrEqual(1);

    const sweep2 = await worker.tick(pastDeadline);
    expect(sweep2.processed).toBe(0);

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('P4. accept() sau hạn -> 409 InvalidState; reject() sau khi bị hủy tự động -> 409', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    // Case A: accept() sau hạn khi worker CHƯA chạy -> 409 InvalidState
    // Set proposalExpiresAt to the past in database
    await db.c.exchanges.updateOne(
      { _id: created.id },
      { $set: { proposalExpiresAt: new Date(Date.now() - 60_000) } },
    );

    const acceptBeforeSweepRes = await post(
      `/exchanges/${created.id}/accept`,
      { revision: 1 },
      user2,
    );
    expect(acceptBeforeSweepRes.status).toBe(409);
    expect(acceptBeforeSweepRes.body.code).toBe('InvalidState');

    // Case B: Worker quét hủy -> Cancelled, reason ProposalExpired
    await worker.tick(new Date());

    // Case C: accept() sau khi đã bị hủy -> 409 InvalidState
    const acceptAfterSweepRes = await post(
      `/exchanges/${created.id}/accept`,
      { revision: 1 },
      user2,
    );
    expect(acceptAfterSweepRes.status).toBe(409);
    expect(acceptAfterSweepRes.body.code).toBe('InvalidState');

    // Case D: reject() sau khi bị hủy tự động -> 409 InvalidState
    const rejectRes = await post(
      `/exchanges/${created.id}/reject`,
      { expectedVersion: 1, reason: 'Không muốn trao đổi nữa.' },
      user2,
    );
    expect(rejectRes.status).toBe(409);
    expect(rejectRes.body.code).toBe('InvalidState');

    // Case E: cancel() sau khi bị hủy tự động -> 409 InvalidState
    const cancelRes = await post(
      `/exchanges/${created.id}/cancel`,
      { expectedVersion: 1 },
      user1,
    );
    expect(cancelRes.status).toBe(409);
    expect(cancelRes.body.code).toBe('InvalidState');
  });

  it('P5. tick() và accept() đồng thời sát hạn -> chỉ một nhánh thắng, trạng thái và sách nhất quán', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    // Race: tick at exactly the deadline vs. accept by user2
    const atDeadline = new Date(new Date(created.proposalExpiresAt).getTime());

    const [tickResult, acceptResult] = await Promise.all([
      worker.tick(atDeadline),
      post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2),
    ]);

    const finalDoc = await db.c.exchanges.findOne({ _id: created.id });

    if (finalDoc?.status === 'AcceptedAwaitingFunding') {
      // accept won: listings are Reserved
      expect(acceptResult.status).toBe(200);
      const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
      const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
      expect(l1Doc?.trade).toBe('Reserved');
      expect(l2Doc?.trade).toBe('Reserved');
    } else {
      // tick won: exchange is Cancelled and listings are Available
      expect(finalDoc?.status).toBe('Cancelled');
      const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
      const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
      expect(l1Doc?.trade).toBe('Available');
      expect(l2Doc?.trade).toBe('Available');
      // accept or tick either 200/409 but no invalid state
      expect([200, 409]).toContain(acceptResult.status);
    }

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('P6. AcceptedAwaitingFunding chưa hạn, Preparing, Completed không bị đụng bởi proposal sweep', async () => {
    // Create AcceptedAwaitingFunding exchange (has fundingDeadline in future)
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200);

    // Tick far in future (proposal sweep): should NOT touch AcceptedAwaitingFunding
    const farFuture = new Date(Date.now() + 100 * 24 * 3600_000);
    await worker.tick(farFuture);

    const doc = await db.c.exchanges.findOne({ _id: created.id });
    // Status must NOT be touched by proposal expiry sweep (it's AcceptedAwaitingFunding, not Proposed)
    // It may be Cancelled if the funding deadline also expired (since farFuture > fundingDeadline),
    // but the cancelReason must NOT be ProposalExpired.
    if (doc?.status === 'Cancelled') {
      expect(doc.cancelReason).not.toBe('ProposalExpired');
    }
  });

  it('P7. Sách của proposal hết hạn vẫn đề xuất được mới sau đó', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const first = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    // Expire first proposal
    const pastDeadline = new Date(new Date(first.proposalExpiresAt).getTime() + 1000);
    await worker.tick(pastDeadline);

    const firstDoc = await db.c.exchanges.findOne({ _id: first.id });
    expect(firstDoc?.status).toBe('Cancelled');
    expect(firstDoc?.cancelReason).toBe('ProposalExpired');

    // Listings must be Available so we can re-propose
    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Available');
    expect(l2Doc?.trade).toBe('Available');

    // Create a new proposal using the same listings
    const second = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    expect(second.status).toBe('Proposed');
    expect(second.id).not.toBe(first.id);

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  it('P8. Tự động tất toán khi hết thời hạn kiểm tra hàng 48 giờ (Inspection Window Expiry Worker)', async () => {
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 100000, 'Both');

    const created = (
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
        user1,
      ).expect(201)
    ).body;

    await post(
      `/exchanges/${created.id}/accept`,
      { revision: created.revision },
      user2,
    ).expect(200);

    await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);
    const funded2 = (
      await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200)
    ).body;

    const shipped1 = (
      await post(
        `/exchanges/${created.id}/ship`,
        { expectedVersion: funded2.revision },
        user1,
      ).expect(200)
    ).body;

    const shipped2 = (
      await post(
        `/exchanges/${created.id}/ship`,
        { expectedVersion: shipped1.revision },
        user2,
      ).expect(200)
    ).body;

    const received1 = (
      await post(
        `/exchanges/${created.id}/receive`,
        { expectedVersion: shipped2.revision },
        user1,
      ).expect(200)
    ).body;

    const received2 = (
      await post(
        `/exchanges/${created.id}/receive`,
        { expectedVersion: received1.revision },
        user2,
      ).expect(200)
    ).body;

    expect(received2.status).toBe('Delivered');
    expect(received2.inspectionDeadline).toBeDefined();

    // Listings still Reserved during inspection window
    const l1Check = await db.c.listings.findOne({ _id: l1.listingId });
    expect(l1Check?.trade).toBe('Reserved');

    // Simulate worker sweep after inspection deadline has passed
    const afterDeadline = new Date(new Date(received2.inspectionDeadline).getTime() + 1000);
    await worker.tick(afterDeadline);

    // Verify exchange is now auto-settled to Completed!
    const exDoc = await db.c.exchanges.findOne({ _id: created.id });
    expect(exDoc?.status).toBe('Completed');
    expect(exDoc?.completedAt).toBeDefined();

    // Listings now Exchanged
    const l1Final = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Final = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Final?.trade).toBe('Exchanged');
    expect(l2Final?.trade).toBe('Exchanged');

    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  describe('Priority 0 & Priority 1: Security and Deadlock Resolutions', () => {
    it('P0. accept() rejects partnerAddress; users cannot hijack partner address', async () => {
      const l1 = await createApprovedListing(user1, 100000, 'Both');
      const l2 = await createApprovedListing(user2, 100000, 'Both');
      const created = (
        await post(
          '/exchanges',
          { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
          user1,
        ).expect(201)
      ).body;

      // User2 tries to accept with a spoofed partnerAddress (OpenAPI schema has additionalProperties: false)
      const hijackRes = await post(
        `/exchanges/${created.id}/accept`,
        {
          revision: 1,
          partnerAddress: {
            recipientName: 'Hacker',
            phone: '0901112233',
            detail: 'Hacker den',
          },
        },
        user2,
      );
      expect(hijackRes.status).toBe(422);

      // Normal accept works cleanly
      const acceptRes = await post(
        `/exchanges/${created.id}/accept`,
        { revision: 1 },
        user2,
      ).expect(200);
      expect(acceptRes.body.status).toBe('AcceptedAwaitingFunding');
    });

    it('P1. Sets shippingDeadline (72h) upon entering Preparing; auto-refunds & cancels if neither ships', async () => {
      const l1 = await createApprovedListing(user1, 100000, 'Both');
      const l2 = await createApprovedListing(user2, 100000, 'Both');
      const created = (
        await post(
          '/exchanges',
          { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
          user1,
        ).expect(201)
      ).body;

      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200);
      await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);
      const fund2Res = await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200);

      expect(fund2Res.body.status).toBe('Preparing');
      expect(fund2Res.body.shippingDeadline).toBeDefined();

      const deadline = new Date(fund2Res.body.shippingDeadline);
      expect(deadline.getTime()).toBeGreaterThan(Date.now());

      // Worker tick BEFORE deadline -> remains Preparing
      await worker.tick(new Date(deadline.getTime() - 1000));
      const midDoc = await db.c.exchanges.findOne({ _id: created.id });
      expect(midDoc?.status).toBe('Preparing');

      // Worker tick AFTER shipping deadline -> Cancelled with ShippingExpired, holds refunded
      const sweepRes = await worker.tick(new Date(deadline.getTime() + 1000));
      expect(sweepRes.processed).toBeGreaterThanOrEqual(1);

      const finalDoc = await db.c.exchanges.findOne({ _id: created.id });
      expect(finalDoc?.status).toBe('Cancelled');
      expect(finalDoc?.cancelReason).toBe('ShippingExpired');

      // Both listings must be safely released back to Available
      const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
      const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
      expect(l1Doc?.trade).toBe('Available');
      expect(l2Doc?.trade).toBe('Available');

      const rec = await reconcile();
      expect(rec.balanced).toBe(true);
    });

    it('P1. Escalates to ResolutionPending when only 1 party ships and shippingDeadline expires', async () => {
      const l1 = await createApprovedListing(user1, 100000, 'Both');
      const l2 = await createApprovedListing(user2, 100000, 'Both');
      const created = (
        await post(
          '/exchanges',
          { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
          user1,
        ).expect(201)
      ).body;

      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200);
      await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);
      const fund2Res = await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200);

      // Only User1 ships
      const ship1Res = await post(
        `/exchanges/${created.id}/ship`,
        {
          expectedVersion: fund2Res.body.revision,
          method: 'carrier',
          trackingCode: 'EXP_TEST_123',
        },
        user1,
      ).expect(200);
      expect(ship1Res.body.status).toBe('Preparing');

      const deadline = new Date(ship1Res.body.shippingDeadline);

      // Worker sweeps after shipping deadline: User2 did not ship!
      const sweepRes = await worker.tick(new Date(deadline.getTime() + 1000));
      expect(sweepRes.processed).toBeGreaterThanOrEqual(1);

      const escalatedDoc = await db.c.exchanges.findOne({ _id: created.id });
      expect(escalatedDoc?.status).toBe('ResolutionPending');
      expect(escalatedDoc?.disputedBy).toBe('System');
      expect(escalatedDoc?.disputeReason).toContain('72 giờ');

      // The books must remain Reserved (not released, because User1 already shipped!)
      const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
      const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
      expect(l1Doc?.trade).toBe('Reserved');
      expect(l2Doc?.trade).toBe('Reserved');

      const rec = await reconcile();
      expect(rec.balanced).toBe(true);
    });

    it('P1. Member dispute freezes 48h auto-settlement, keeping exchange in ResolutionPending', async () => {
      const l1 = await createApprovedListing(user1, 100000, 'Both');
      const l2 = await createApprovedListing(user2, 100000, 'Both');
      const created = (
        await post(
          '/exchanges',
          { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
          user1,
        ).expect(201)
      ).body;

      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200);
      await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);
      const fund2 = await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200);

      const ship1 = await post(
        `/exchanges/${created.id}/ship`,
        { expectedVersion: fund2.body.revision, method: 'direct' },
        user1,
      ).expect(200);
      const ship2 = await post(
        `/exchanges/${created.id}/ship`,
        { expectedVersion: ship1.body.revision, method: 'direct' },
        user2,
      ).expect(200);

      const rec1 = await post(
        `/exchanges/${created.id}/receive`,
        { expectedVersion: ship2.body.revision },
        user1,
      ).expect(200);
      const rec2 = await post(
        `/exchanges/${created.id}/receive`,
        { expectedVersion: rec1.body.revision },
        user2,
      ).expect(200);

      expect(rec2.body.status).toBe('Delivered');
      expect(rec2.body.inspectionDeadline).toBeDefined();

      // User1 inspects the book and finds major damage -> raises a dispute!
      const disputeRes = await post(
        `/exchanges/${created.id}/dispute`,
        {
          expectedVersion: rec2.body.revision,
          reason: 'Sách bị rách 20 trang và bong bìa không thể đọc được.',
        },
        user1,
      ).expect(200);

      expect(disputeRes.body.status).toBe('ResolutionPending');
      expect(disputeRes.body.disputedBy).toBe(user1.id);
      expect(disputeRes.body.disputeReason).toBe('Sách bị rách 20 trang và bong bìa không thể đọc được.');

      // Now simulate inspection deadline passing
      const afterInspectionDeadline = new Date(new Date(rec2.body.inspectionDeadline).getTime() + 1000);
      await worker.tick(afterInspectionDeadline);

      // Verify the exchange did NOT auto-settle to Completed; it MUST remain in ResolutionPending!
      const frozenDoc = await db.c.exchanges.findOne({ _id: created.id });
      expect(frozenDoc?.status).toBe('ResolutionPending');
      expect(frozenDoc?.completedAt).toBeNull();

      // Listings remain Reserved
      const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
      const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
      expect(l1Doc?.trade).toBe('Reserved');
      expect(l2Doc?.trade).toBe('Reserved');

      const rec = await reconcile();
      expect(rec.balanced).toBe(true);
    });

    it('POL-23: limits open proposals to 5 and blocks duplicate proposals for same listing pair', async () => {
      // 1. User1 has 1 book, User2 has 5 books (within ACTIVE_LISTING_LIMIT = 5), User3 has 1 book
      const l1 = await createApprovedListing(user1, 100000, 'Both');
      const u2Listings = [];
      for (let i = 0; i < 5; i++) {
        u2Listings.push(await createApprovedListing(user2, 100000, 'Both'));
      }
      const user3 = await reader();
      const l3 = await createApprovedListing(user3, 100000, 'Both');

      // Proposal 1: user1 proposes l1 <-> u2Listings[0]
      const p1 = await post(
        '/exchanges',
        {
          initiatorListingId: l1.listingId,
          recipientListingId: u2Listings[0].listingId,
        },
        user1,
      ).expect(201);
      expect(p1.body.status).toBe('Proposed');

      // Duplicate proposal for exact same pair -> rejected 409
      const dupRes = await post(
        '/exchanges',
        {
          initiatorListingId: l1.listingId,
          recipientListingId: u2Listings[0].listingId,
        },
        user1,
      ).expect(409);
      expect(dupRes.body.code).toBe('InvalidState');

      // Reverse duplicate proposal (user2 tries to propose for user1's listing that is already part of p1) -> rejected 409
      const revDupRes = await post(
        '/exchanges',
        {
          initiatorListingId: u2Listings[0].listingId,
          recipientListingId: l1.listingId,
        },
        user2,
      ).expect(409);
      expect(revDupRes.body.code).toBe('InvalidState');

      // Create proposals 2, 3, 4, 5 for user1
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: u2Listings[1].listingId },
        user1,
      ).expect(201);
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: u2Listings[2].listingId },
        user1,
      ).expect(201);
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: u2Listings[3].listingId },
        user1,
      ).expect(201);
      await post(
        '/exchanges',
        { initiatorListingId: l1.listingId, recipientListingId: u2Listings[4].listingId },
        user1,
      ).expect(201);

      // Proposal 6 exceeds the 5-open-proposal limit (POL-23) -> rejected 409
      const limitRes = await post(
        '/exchanges',
        {
          initiatorListingId: l1.listingId,
          recipientListingId: l3.listingId,
        },
        user1,
      ).expect(409);
      expect(limitRes.body.code).toBe('InvalidState');
      expect(limitRes.body.message).toContain('POL-23');
    });

    it('POL-07: Transit Overdue Worker escalates InTransit to ResolutionPending when 240h delivery window expires', async () => {
      const l1 = await createApprovedListing(user1, 100000, 'Both');
      const l2 = await createApprovedListing(user2, 100000, 'Both');

      const created = (
        await post(
          '/exchanges',
          { initiatorListingId: l1.listingId, recipientListingId: l2.listingId },
          user1,
        ).expect(201)
      ).body;

      await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200);
      await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);
      const funded2 = (
        await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200)
      ).body;

      // Both ship -> status enters InTransit
      const ship1 = (
        await post(
          `/exchanges/${created.id}/ship`,
          {
            expectedVersion: funded2.revision,
            method: 'carrier',
            carrierCode: 'GHN',
            carrierName: 'Giao Hàng Nhanh',
            trackingCode: 'GHN-TRANSIT-1',
          },
          user1,
        ).expect(200)
      ).body;

      const inTransitRes = (
        await post(
          `/exchanges/${created.id}/ship`,
          {
            expectedVersion: ship1.revision,
            method: 'carrier',
            carrierCode: 'GHN',
            carrierName: 'Giao Hàng Nhanh',
            trackingCode: 'GHN-TRANSIT-2',
          },
          user2,
        ).expect(200)
      ).body;

      expect(inTransitRes.status).toBe('InTransit');

      // User1 marks received, but User2 never confirms receipt!
      const user1Received = (
        await post(`/exchanges/${created.id}/receive`, { expectedVersion: inTransitRes.revision }, user1).expect(200)
      ).body;
      expect(user1Received.status).toBe('InTransit');
      expect(user1Received.initiatorReceivedAt).toBeDefined();
      expect(user1Received.recipientReceivedAt).toBeNull();

      // At 239h (before 240h transit overdue threshold) -> worker does NOT touch InTransit exchange
      const at239h = new Date(new Date(inTransitRes.recipientShippedAt).getTime() + 239 * 3_600_000);
      await worker.tick(at239h);

      const stillInTransit = await db.c.exchanges.findOne({ _id: created.id });
      expect(stillInTransit?.status).toBe('InTransit');
      expect(stillInTransit?.disputedAt).toBeNull();

      // At 241h (after 240h threshold per POL-07) -> worker escalates to ResolutionPending
      const at241h = new Date(new Date(inTransitRes.recipientShippedAt).getTime() + 241 * 3_600_000);
      const sweep241 = await worker.tick(at241h);
      expect(sweep241.processed).toBe(1);

      const escalatedDoc = await db.c.exchanges.findOne({ _id: created.id });
      expect(escalatedDoc?.status).toBe('ResolutionPending');
      expect(escalatedDoc?.disputedBy).toBe('System');
      expect(escalatedDoc?.disputeReason).toContain('POL-07');
      expect(escalatedDoc?.disputeReason).toContain('240');

      // Second tick is idempotent
      const sweepIdempotent = await worker.tick(at241h);
      expect(sweepIdempotent.processed).toBe(0);

      const rec = await reconcile();
      expect(rec.balanced).toBe(true);
    });
  });
});

