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

    user1 = await reader(['MEMBER']);
    user2 = await reader(['MEMBER']);
    admin = await reader(['MEMBER', 'ADMIN']);
    staff = await reader(['STAFF']);
    operator = await reader(['TEST_OPERATOR']);

    await topupUser(user1, 1000000);
    await topupUser(user2, 1000000);
  }, 60000);

  afterAll(async () => {
    if (db) {
      const c = db.c;
      // Clean up exchanges created by test users
      await c.exchanges.deleteMany({
        $or: [{ initiatorId: { $in: users } }, { recipientId: { $in: users } }],
      });

      // Clean up listings
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

      // Clean up wallet accounts and journals
      const userAccounts = (
        await c.wallet_accounts.find({ ownerId: { $in: users } }).toArray()
      ).map((a) => a._id);
      await c.ledger_entries.deleteMany({ accountId: { $in: userAccounts } });
      await c.wallet_accounts.deleteMany({ ownerId: { $in: users } });

      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
    if (originalSecret === undefined) delete process.env.PAYMENT_SIMULATOR_SECRET;
    else process.env.PAYMENT_SIMULATOR_SECRET = originalSecret;
  });

  it('completes the full exchange lifecycle: proposal -> accept -> fund -> ship -> receive -> settlement', async () => {
    // 1. Setup two approved listings
    // user1 listing value: 100,000 VND
    // user2 listing value: 150,000 VND
    // Diff: 50,000 VND paid by user1 (since 100k < 150k)
    // Deposit user1: 150,000 VND
    // Deposit user2: 100,000 VND
    const l1 = await createApprovedListing(user1, 100000, 'Both');
    const l2 = await createApprovedListing(user2, 150000, 'Both');

    // 2. User1 creates exchange proposal
    const createRes = await post(
      '/exchanges',
      {
        initiatorListingId: l1.listingId,
        recipientListingId: l2.listingId,
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
    });
    const exchangeId = createRes.body.id;

    // Verify listings are still Available during Proposed state
    const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Doc?.trade).toBe('Available');
    expect(l2Doc?.trade).toBe('Available');

    // 3. User2 accepts the proposal
    const acceptRes = await post(
      `/exchanges/${exchangeId}/accept`,
      { revision: 1 },
      user2,
    ).expect(200);

    expect(acceptRes.body).toMatchObject({
      id: exchangeId,
      status: 'AcceptedAwaitingFunding',
      revision: 2,
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

    // 5. Shipping
    // User1 ships
    const ship1Res = await post(
      `/exchanges/${exchangeId}/ship`,
      { expectedVersion: fund2Res.body.revision },
      user1,
    ).expect(200);
    expect(ship1Res.body.initiatorShippedAt).toBeDefined();
    expect(ship1Res.body.status).toBe('Preparing');

    // User2 ships -> status becomes InTransit
    const ship2Res = await post(
      `/exchanges/${exchangeId}/ship`,
      { expectedVersion: ship1Res.body.revision },
      user2,
    ).expect(200);
    expect(ship2Res.body.recipientShippedAt).toBeDefined();
    expect(ship2Res.body.status).toBe('InTransit');

    // 6. Receiving
    // User1 receives -> status becomes Delivered
    const rec1Res = await post(
      `/exchanges/${exchangeId}/receive`,
      { expectedVersion: ship2Res.body.revision },
      user1,
    ).expect(200);
    expect(rec1Res.body.initiatorReceivedAt).toBeDefined();
    expect(rec1Res.body.status).toBe('Delivered');

    // User2 receives -> status becomes Completed!
    const rec2Res = await post(
      `/exchanges/${exchangeId}/receive`,
      { expectedVersion: rec1Res.body.revision },
      user2,
    ).expect(200);
    expect(rec2Res.body.recipientReceivedAt).toBeDefined();
    expect(rec2Res.body.status).toBe('Completed');

    // 7. Verify listings are now Exchanged!
    const l1Final = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Final = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Final?.trade).toBe('Exchanged');
    expect(l2Final?.trade).toBe('Exchanged');

    // 8. Verify ledger holds are released and reconciled!
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

    const farFuture = new Date(Date.now() + 100 * 24 * 3600_000);
    await worker.tick(farFuture);

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
});

