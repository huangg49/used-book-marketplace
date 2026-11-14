import { Tx } from '../src/database/mongo/transaction.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { canonicalJson } from '../src/common/canonical-json.js';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus, UserDoc } from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { ExchangesService } from '../src/modules/exchanges/exchanges.service.js';
import { ExchangeExpiryWorker } from '../src/modules/exchanges/exchange-expiry.service.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { Gate } from './helpers/mongo-gate.js';
import { applyCollectionSpecs, currentCollections } from '../src/database/mongo/migrations/index.js';
import { exchangeInspectionDeadlinesMigration } from '../src/database/mongo/migrations/0039-exchange-inspection-deadlines.js';

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

  const carrierEvent = (code: string, status = 'PICKING') =>
    request(app.getHttpServer()).post('/api/v1/webhooks/carrier').send({ trackingCode: code, status });

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
    // Keep the complete expanded suite within the finite 100M simulator capital;
    // 750k covers the largest obligation without altering ledger/reference data.
    await topupUser(user1, 750000);
    await topupUser(user2, 750000);
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

  describe('frozen exchange agreement', () => {
    async function propose(aValue = 100000, bValue = 150000) {
      const a = await createApprovedListing(user1, aValue);
      const b = await createApprovedListing(user2, bValue);
      const response = await post('/exchanges', { initiatorListingId: a.listingId, recipientListingId: b.listingId }, user1).expect(201);
      return { a, b, exchange: response.body };
    }

    it('accepts 2,000 characters and serializes concurrent sends at the shared limit', async () => {
      const { exchange } = await propose();
      const path = '/exchanges/' + exchange.id + '/messages';
      const body = String.fromCodePoint(0x1f4d6).repeat(2000);
      await post(path, { body: body + 'a' }, user1).expect(422);
      await post(path, { body }, user1).expect(201);
      const sentAt = new Date();
      await db.c.exchange_messages.insertMany(Array.from({ length: 19 }, (_, index) => ({
        _id: randomUUID(),
        exchangeId: exchange.id,
        senderId: user1.id,
        body: 'QA seeded chat row',
        sentAt,
        ...(index < 18 ? { memberAuthored: true } : {}),
      })));
      const gate = await Gate.lockUser(db.client, user1.id);
      try {
        const sends = [1, 2].map((index) =>
          post(path, { body: 'Concurrent send ' + index }, user1).then((result) => result),
        );
        await gate.contended(2);
        await gate.commit();
        const results = await Promise.all(sends);
        expect(results.map((response) => response.status).sort()).toEqual([201, 429]);
        expect(await db.c.exchange_messages.countDocuments({
          exchangeId: exchange.id, senderId: user1.id, memberAuthored: true,
        })).toBe(20);
      } finally { await gate.close(); }
    });

    it('pins books and server-computed money through replacement, acceptance and replay', async () => {
      const { a, b, exchange } = await propose();
      expect(exchange.agreement.initiatorBooks[0]).toMatchObject({ listingId: a.listingId, listingVersion: a.version, exchangeValue: 100000, condition: 'Good' });
      expect(exchange.agreement.recipientBook).toMatchObject({ listingId: b.listingId, exchangeValue: 150000 });
      expect(exchange.agreement.recipientBook.book.title).toBeTruthy();
      expect((await db.c.listings.findOne({ _id: a.listingId }))?.trade).toBe('Available');
      await post('/exchanges/' + exchange.id + '/counter', { expectedVersion: 1, diffAmount: 0, diffPayer: 'none' }, user2).expect(422);
      await post('/exchanges/' + exchange.id + '/counter', { expectedVersion: 1, listingIds: [a.listingId] }, user1).expect(409);
      await post('/exchanges/' + exchange.id + '/counter', { expectedVersion: 1, listingIds: [a.listingId] }, user2).expect(409);
      const replacement = await createApprovedListing(user2, 200000);
      const counterBody = { expectedVersion: 1, listingIds: [replacement.listingId] };
      const key = randomUUID();
      const counter = (await post('/exchanges/' + exchange.id + '/counter', counterBody, user2, key).expect(200)).body;
      expect(counter).toMatchObject({ revision: 2, recipientListingId: replacement.listingId, initiatorDeposit: 200000, recipientDeposit: 100000, diffAmount: 100000, diffPayerId: user1.id, lastProposedById: user2.id });
      await post('/exchanges/' + exchange.id + '/accept', { revision: 1 }, user1).expect(409);
      const acceptKey = randomUUID();
      const accepted = (await post('/exchanges/' + exchange.id + '/accept', { revision: 2 }, user1, acceptKey).expect(200)).body;
      expect(accepted.status).toBe('AcceptedAwaitingFunding');
      expect(accepted.agreement).toEqual(counter.agreement);
      expect((await post('/exchanges/' + exchange.id + '/accept', { revision: 2 }, user1, acceptKey).expect(200)).body).toEqual(accepted);
      expect((await post('/exchanges/' + exchange.id + '/counter', counterBody, user2, key).expect(200)).body).toEqual(counter);
      await post('/exchanges/' + exchange.id + '/counter', { ...counterBody, listingIds: [b.listingId] }, user2, key).expect(409);
      expect((await db.c.listings.findOne({ _id: b.listingId }))?.trade).toBe('Available');
      expect((await db.c.listings.findOne({ _id: a.listingId }))?.trade).toBe('Reserved');
      expect((await db.c.listings.findOne({ _id: replacement.listingId }))?.trade).toBe('Reserved');
      const mediaId = counter.agreement.recipientBook.mediaIds[0];
      const photoPath = '/exchanges/' + exchange.id + '/books/' + replacement.listingId + '/photos/' + mediaId;
      await get(photoPath, user1).expect(200);
      const outsider = await reader();
      await get(photoPath, outsider).expect(404);
      await get(photoPath).expect(401);
      await get('/exchanges/' + exchange.id + '/books/' + b.listingId + '/photos/' + mediaId, user1).expect(404);
      // A new public state never changes the copied facts or participant photo scope.
      await db.c.listings.updateOne({ _id: replacement.listingId }, { $set: { visibility: 'Hidden' } });
      expect((await get('/exchanges/' + exchange.id, user1).expect(200)).body.agreement).toEqual(counter.agreement);
      await get(photoPath, user1).expect(200);
      await db.c.auth_sessions.updateOne({ _id: user1.sessionId }, { $set: { revokedAt: new Date() } });
      await get(photoPath, user1).expect(401);
    });

    it('lets the initiator respond with multiple owned replacement books and recalculates the payer', async () => {
      const { a, b, exchange } = await propose();
      const replacementB = await createApprovedListing(user2, 200000);
      const replacementA1 = await createApprovedListing(user1, 150000);
      const replacementA2 = await createApprovedListing(user1, 100000);
      await post('/exchanges/' + exchange.id + '/counter', { expectedVersion: 1, listingIds: [replacementB.listingId] }, user2).expect(200);
      await post('/exchanges/' + exchange.id + '/counter', { expectedVersion: 2, listingIds: [b.listingId] }, user2).expect(409);
      await post('/exchanges/' + exchange.id + '/counter', { expectedVersion: 2, listingIds: [replacementA1.listingId, replacementA1.listingId] }, user1).expect(422);
      const second = (await post('/exchanges/' + exchange.id + '/counter', { expectedVersion: 2, listingIds: [replacementA1.listingId, replacementA2.listingId] }, user1).expect(200)).body;
      expect(second).toMatchObject({ revision: 3, initiatorListingIds: [replacementA1.listingId, replacementA2.listingId], initiatorDeposit: 200000, recipientDeposit: 250000, diffAmount: 50000, diffPayerId: user2.id });
      await post('/exchanges/' + exchange.id + '/accept', { revision: 2 }, user2).expect(409);
      const accepted = (await post('/exchanges/' + exchange.id + '/accept', { revision: 3 }, user2).expect(200)).body;
      expect(accepted.status).toBe('AcceptedAwaitingFunding');
      expect(accepted.agreement).toEqual(second.agreement);
      for (const listingId of [a.listingId, b.listingId]) expect((await db.c.listings.findOne({ _id: listingId }))?.trade).toBe('Available');
      for (const listingId of [replacementA1.listingId, replacementA2.listingId, replacementB.listingId]) expect((await db.c.listings.findOne({ _id: listingId }))?.trade).toBe('Reserved');
      await post('/exchanges/' + exchange.id + '/funding', {}, user1).expect(200);
      const funded = (await post('/exchanges/' + exchange.id + '/funding', {}, user2).expect(200)).body;
      expect(funded.status).toBe('Preparing');
      expect((await get('/me/wallet', user1).expect(200)).body.available).toBe(550000);
      expect((await get('/me/wallet', user2).expect(200)).body.available).toBe(450000);
      expect((await reconcile()).balanced).toBe(true);
    });

    it.each(['PendingReview', 'Approved'] as const)('closes a repriced %s proposal without reserving either book', async (moderation) => {
      const { a, b, exchange } = await propose();
      const current = (await get('/me/listings/' + b.listingId, user2).expect(200)).body;
      const revised = (await post('/listings/' + b.listingId + '/revision', { expectedVersion: current.version, ownershipDeclared: true, content: { ...current.currentRevision.content, exchangeValue: 600000 } }, user2).expect(200)).body;
      if (moderation === 'Approved') await post('/operations/listings/' + b.listingId + '/decision', { expectedVersion: revised.version, revisionId: revised.revisionId, decision: 'Approve', checklist }, staff).expect(200);
      const key = randomUUID();
      const result = (await post('/exchanges/' + exchange.id + '/accept', { revision: 1 }, user2, key).expect(200)).body;
      expect(result).toMatchObject({ status: 'Cancelled', cancelReason: 'ListingUnavailable', revision: 2 });
      expect(result.agreement.recipientBook.exchangeValue).toBe(150000);
      expect((await post('/exchanges/' + exchange.id + '/accept', { revision: 1 }, user2, key).expect(200)).body).toEqual(result);
      for (const listingId of [a.listingId, b.listingId]) expect((await db.c.listings.findOne({ _id: listingId }))?.trade).toBe('Available');
      expect(await db.c.ledger_journals.countDocuments({ orderId: { $in: [(await db.c.exchanges.findOne({ _id: exchange.id }))!.initiatorOrderId] } })).toBe(0);
    });

    it.each(['Hidden', 'LOCKED', 'RESTRICTED'] as const)('rejects new acceptance when the other side becomes %s', async (condition) => {
      const { a, b, exchange } = await propose();
      if (condition === 'Hidden') await db.c.listings.updateOne({ _id: a.listingId }, { $set: { visibility: 'Hidden' }, $inc: { version: 1 } });
      else await db.c.users.updateOne({ _id: user1.id }, { $set: { status: condition } });
      const result = (await post('/exchanges/' + exchange.id + '/accept', { revision: 1 }, user2).expect(200)).body;
      expect(result).toMatchObject({ status: 'Cancelled', cancelReason: 'ListingUnavailable' });
      for (const listingId of [a.listingId, b.listingId]) expect((await db.c.listings.findOne({ _id: listingId }))?.trade).toBe('Available');
    });

    it('keeps legacy obligations but never invents a missing agreement for a new acceptance', async () => {
      const { exchange } = await propose();
      await db.c.exchanges.updateOne({ _id: exchange.id }, { $unset: { agreement: '' } });
      expect((await get('/exchanges/' + exchange.id, user1).expect(200)).body.agreement).toBeNull();
      expect((await post('/exchanges/' + exchange.id + '/accept', { revision: 1 }, user2).expect(200)).body.status).toBe('Cancelled');
      const next = await propose();
      await post('/exchanges/' + next.exchange.id + '/accept', { revision: 1 }, user2).expect(200);
      await db.c.exchanges.updateOne({ _id: next.exchange.id }, { $unset: { agreement: '' } });
      await topupUser(user1);
      expect((await post('/exchanges/' + next.exchange.id + '/funding', {}, user1).expect(200)).body.initiatorFundedAt).toBeTruthy();
    });

    it('rechecks the book version after real lock contention instead of accepting stale facts', async () => {
      const { a, b, exchange } = await propose();
      const gate = await Gate.lock(db.client, 'listings', [a.listingId]);
      try {
        const pending = post('/exchanges/' + exchange.id + '/accept', { revision: 1 }, user2).then((r) => r);
        await gate.contended();
        // Concurrent owner state change committed before the waiting command resumes.
        await gate.db.collection('listings').updateOne({ _id: a.listingId as never }, { $set: { visibility: 'Hidden' }, $inc: { version: 1 } }, { session: gate.session });
        await gate.commit();
        const result = await pending;
        expect(result.status).toBe(200);
        expect(result.body.status).toBe('Cancelled');
        expect((await db.c.listings.findOne({ _id: b.listingId }))?.trade).toBe('Available');
      } finally { await gate.close(); }
    });
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
    expect(ship1Res.body.initiatorShippedAt).toBeNull();
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
    expect(ship2Res.body.recipientShippedAt).toBeNull();
    expect(ship2Res.body.recipientShipment).toMatchObject({
      method: 'carrier',
      carrierCode: 'GHTK',
      trackingCode: 'GHTK777888',
    });
    expect(ship2Res.body.status).toBe('Preparing');
    await carrierEvent('GHN888999').expect(200);
    await carrierEvent('GHTK777888').expect(200);
    const inTransit = (await get('/exchanges/' + exchangeId, user1).expect(200)).body;
    expect(inTransit.status).toBe('InTransit');

    // 6. Receiving
    // User1 receives -> status remains InTransit until both sides receive
    const rec1Res = await post(
      `/exchanges/${exchangeId}/receive`,
      { expectedVersion: inTransit.revision },
      user1,
    ).expect(200);
    expect(rec1Res.body.initiatorReceivedAt).toBeDefined();
    expect(rec1Res.body.status).toBe('InTransit');

    // User2 receives -> both sides received, enters independent 72h inspection windows (Delivered)!
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

    // Both acknowledgements preserve the full inspection windows and all holds.
    const comp2Res = await post(
      `/exchanges/${exchangeId}/complete`,
      { expectedVersion: comp1Res.body.revision },
      user2,
    ).expect(200);
    expect(comp2Res.body.recipientCompletedAt).toBeDefined();
    expect(comp2Res.body.status).toBe('Delivered');
    expect(comp2Res.body.completedAt).toBeNull();
    expect((await db.c.listings.findOne({ _id: l1.listingId }))?.trade).toBe('Reserved');
    await worker.tick(new Date(Date.parse(comp2Res.body.inspectionDeadline) + 1));
    expect((await db.c.exchanges.findOne({ _id: exchangeId }))?.status).toBe('Completed');

    // 8. Verify listings are now Exchanged!
    const l1Final = await db.c.listings.findOne({ _id: l1.listingId });
    const l2Final = await db.c.listings.findOne({ _id: l2.listingId });
    expect(l1Final?.trade).toBe('Exchanged');
    expect(l2Final?.trade).toBe('Exchanged');

    // 9. Verify ledger holds are released and reconciled!
    const rec = await reconcile();
    expect(rec.balanced).toBe(true);
  });

  async function preparedExchange(initValue = 100000, recValue = 100000) {
    const l1 = await createApprovedListing(user1, initValue, 'Both');
    const l2 = await createApprovedListing(user2, recValue, 'Both');
    const created = (await post('/exchanges', {
      initiatorListingId: l1.listingId, recipientListingId: l2.listingId,
    }, user1).expect(201)).body;
    await post(`/exchanges/${created.id}/accept`, { revision: 1 }, user2).expect(200);
    await post(`/exchanges/${created.id}/funding`, {}, user1).expect(200);
    const funded = (await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200)).body;
    return { ...funded, l1, l2 };
  }

  async function inTransitExchange(initValue = 100000, recValue = 100000) {
    const ex = await preparedExchange(initValue, recValue);
    const first = (await post(`/exchanges/${ex.id}/ship`, { expectedVersion: ex.revision }, user1).expect(200)).body;
    return (await post(`/exchanges/${ex.id}/ship`, { expectedVersion: first.revision }, user2).expect(200)).body;
  }

  it('pins separate 72h windows, ignores the obsolete 48h setting and never shortens the first receipt', async () => {
    app.get(ConfigService).set('EXCHANGE_INSPECTION_HOURS', 48);
    const ex = await inTransitExchange();
    const key = randomUUID();
    const first = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user1, key).expect(200)).body;
    expect(Date.parse(first.initiatorInspectionDeadline) - Date.parse(first.initiatorReceivedAt)).toBe(72 * 3600000);
    expect(first.recipientInspectionDeadline).toBeNull();
    expect(first.inspectionDeadline).toBeNull();
    expect((await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user1, key).expect(200)).body).toEqual(first);
    // A legacy record received the first leg two days before the second leg.
    const earlier = new Date(Date.parse(first.initiatorReceivedAt) - 48 * 3600000);
    const earlierDeadline = new Date(earlier.getTime() + 72 * 3600000);
    await db.c.exchanges.updateOne({ _id: ex.id }, { $set: {
      initiatorReceivedAt: earlier, initiatorInspectionDeadline: earlierDeadline,
    } });
    const second = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: first.revision }, user2).expect(200)).body;
    expect(second.initiatorInspectionDeadline).toBe(earlierDeadline.toISOString());
    expect(Date.parse(second.recipientInspectionDeadline) - Date.parse(second.recipientReceivedAt)).toBe(72 * 3600000);
    expect(second.inspectionDeadline).toBe(second.recipientInspectionDeadline);
    await worker.tick(new Date(earlierDeadline.getTime() + 1));
    expect((await db.c.exchanges.findOne({ _id: ex.id }))?.status).toBe('Delivered');
    await worker.tick(new Date(Date.parse(second.inspectionDeadline) - 1));
    expect((await db.c.exchanges.findOne({ _id: ex.id }))?.status).toBe('Delivered');
    await worker.tick(new Date(Date.parse(second.inspectionDeadline)));
    expect((await db.c.exchanges.findOne({ _id: ex.id }))?.status).toBe('Completed');
    expect((await reconcile()).balanced).toBe(true);
  });

  it('LOCKED participants read and discharge existing obligations but cannot fund or open new trades; revoked replay fails', async () => {
    const ex = await preparedExchange();
    await db.c.users.updateOne({ _id: user1.id }, { $set: { status: 'LOCKED' } });
    await get(`/exchanges/${ex.id}`, user1).expect(200);
    const mine = await get('/exchanges', user1).expect(200);
    expect(mine.body.items.some((item: { id: string }) => item.id === ex.id)).toBe(true);
    await post(`/exchanges/${ex.id}/funding`, {}, user1).expect(403);
    await post('/exchanges', { initiatorListingId: ex.l1.listingId, recipientListingId: ex.l2.listingId }, user1).expect(403);
    const outsider = await reader(['MEMBER'], 'LOCKED');
    await get(`/exchanges/${ex.id}`, outsider).expect(404);
    await post(`/exchanges/${ex.id}/ship`, { expectedVersion: ex.revision }, outsider).expect(404);
    const ship1 = (await post(`/exchanges/${ex.id}/ship`, { expectedVersion: ex.revision }, user1).expect(200)).body;
    const ship2 = (await post(`/exchanges/${ex.id}/ship`, { expectedVersion: ship1.revision }, user2).expect(200)).body;
    const receiveKey = randomUUID();
    const body = { expectedVersion: ship2.revision };
    const received = (await post(`/exchanges/${ex.id}/receive`, body, user1, receiveKey).expect(200)).body;
    await post(`/exchanges/${ex.id}/dispute`, { expectedVersion: received.revision, reason: 'QA: tình trạng sách cần được đối chiếu.' }, user1).expect(200);
    await db.c.auth_sessions.updateOne({ _id: user1.sessionId }, { $set: { revokedAt: new Date() } });
    await post(`/exchanges/${ex.id}/receive`, body, user1, receiveKey).expect(401);
    expect((await reconcile()).balanced).toBe(true);
  });

  it('backfills active legacy receipts without changing revisions, ledger entries or applied checksums', async () => {
    const ex = await inTransitExchange();
    const first = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user1).expect(200)).body;
    const second = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: first.revision }, user2).expect(200)).body;
    await db.c.exchanges.updateOne({ _id: ex.id }, {
      $unset: { initiatorInspectionDeadline: '', recipientInspectionDeadline: '' },
      $set: { inspectionDeadline: new Date(Date.parse(second.recipientReceivedAt) + 48 * 3600000) },
    });
    const database = db.client.db();
    // This test deliberately reapplies the frozen 0039 validator. Simulate its
    // historical shape, not documents containing fields introduced in 0052.
    const agreements = await db.c.exchanges.find({ agreement: { $ne: null } }, { projection: { _id: 1, agreement: 1 } }).toArray();
    await db.c.exchanges.updateMany({}, { $unset: { agreement: '' } });
    try {
      const checksums = await database.collection('_migrations').find().sort({ _id: 1 }).toArray();
      const postings = await db.c.ledger_entries.countDocuments();
      await exchangeInspectionDeadlinesMigration.up(database);
      const backfilled = (await db.c.exchanges.findOne({ _id: ex.id }))!;
      expect(backfilled.revision).toBe(second.revision);
      expect(backfilled.initiatorInspectionDeadline!.getTime() - backfilled.initiatorReceivedAt!.getTime()).toBe(72 * 3600000);
      expect(backfilled.recipientInspectionDeadline!.getTime() - backfilled.recipientReceivedAt!.getTime()).toBe(72 * 3600000);
      expect(backfilled.inspectionDeadline).toEqual(backfilled.recipientInspectionDeadline);
      expect(await db.c.ledger_entries.countDocuments()).toBe(postings);
      expect(await database.collection('_migrations').find().sort({ _id: 1 }).toArray()).toEqual(checksums);
      await exchangeInspectionDeadlinesMigration.up(database);
      expect(await db.c.exchanges.findOne({ _id: ex.id })).toEqual(backfilled);
      // A longer historically promised window must not be shortened on upgrade.
      const longer = new Date(Date.parse(second.recipientReceivedAt) + 96 * 3600000);
      await db.c.exchanges.updateOne({ _id: ex.id }, {
        $unset: { initiatorInspectionDeadline: '', recipientInspectionDeadline: '' },
        $set: { inspectionDeadline: longer },
      });
      await exchangeInspectionDeadlinesMigration.up(database);
      expect((await db.c.exchanges.findOne({ _id: ex.id }))?.inspectionDeadline).toEqual(longer);
      await worker.tick(new Date(longer.getTime() + 1));
      await db.c.exchanges.updateOne({ _id: ex.id }, {
        $unset: { initiatorInspectionDeadline: '', recipientInspectionDeadline: '' },
      });
      const terminal = await db.c.exchanges.findOne({ _id: ex.id });
      expect(terminal?.status).toBe('Completed');
      await exchangeInspectionDeadlinesMigration.up(database);
      expect(await db.c.exchanges.findOne({ _id: ex.id })).toEqual(terminal);
    } finally {
      // The frozen legacy migration replaces the validator. Restore the current
      // schema even after an assertion fails, without replaying any backfill.
      await applyCollectionSpecs(database, currentCollections().filter((spec) => spec.name === 'exchanges'));
      for (const row of agreements) await db.c.exchanges.updateOne({ _id: row._id }, { $set: { agreement: row.agreement } });
    }
  });

  it('retains dispute evidence and holds even if a legacy writer leaves the state Delivered', async () => {
    const ex = await inTransitExchange();
    const first = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user1).expect(200)).body;
    const second = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: first.revision }, user2).expect(200)).body;
    await post(`/exchanges/${ex.id}/dispute`, { expectedVersion: second.revision, reason: 'QA: giữ hồ sơ đang điều tra.' }, user1).expect(200);
    await db.c.exchanges.updateOne({ _id: ex.id }, { $set: { status: 'Delivered' } });
    const visible = (await get(`/exchanges/${ex.id}`, user1).expect(200)).body;
    expect(visible.status).toBe('ResolutionPending');
    await post(`/exchanges/${ex.id}/complete`, { expectedVersion: visible.revision }, user1).expect(409);
    await post(`/exchanges/${ex.id}/dispute`, { expectedVersion: visible.revision, reason: 'QA: must not overwrite existing evidence.' }, user2).expect(409);
    await worker.tick(new Date(Date.parse(second.inspectionDeadline) + 1));
    expect((await db.c.exchanges.findOne({ _id: ex.id }))?.completedAt).toBeNull();
    const row = (await db.c.exchanges.findOne({ _id: ex.id }))!;
    expect((await db.c.listings.findOne({ _id: row.initiatorListingId }))?.trade).toBe('Reserved');
    expect((await reconcile()).balanced).toBe(true);
  });

  it('keeps the later receiver claim window open after the earlier receiver window ends', async () => {
    const ex = await inTransitExchange();
    const first = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user1).expect(200)).body;
    const second = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: first.revision }, user2).expect(200)).body;
    const earlierReceipt = new Date(Date.parse(second.recipientReceivedAt) - 96 * 3600000);
    await db.c.exchanges.updateOne({ _id: ex.id }, { $set: {
      initiatorReceivedAt: earlierReceipt,
      initiatorInspectionDeadline: new Date(earlierReceipt.getTime() + 72 * 3600000),
    } });
    const body = { expectedVersion: second.revision, reason: 'QA: tình trạng cần đối chiếu trong hạn cá nhân.' };
    await post(`/exchanges/${ex.id}/dispute`, body, user1).expect(409);
    await post(`/exchanges/${ex.id}/dispute`, body, user2).expect(200);
    await worker.tick(new Date(Date.parse(second.inspectionDeadline) + 1));
    expect((await db.c.exchanges.findOne({ _id: ex.id }))?.status).toBe('ResolutionPending');
    expect((await reconcile()).balanced).toBe(true);
  });

  it('serializes a real contended dispute versus expiry and never settles a committed dispute', async () => {
    const ex = await inTransitExchange();
    const first = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user1).expect(200)).body;
    const second = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: first.revision }, user2).expect(200)).body;
    const gate = await Gate.lock(db.client, 'exchanges', [ex.id]);
    let dispute!: Awaited<ReturnType<typeof post>>;
    const pendingDispute = post(`/exchanges/${ex.id}/dispute`, { expectedVersion: second.revision, reason: 'QA: claim cạnh tranh worker.' }, user1).then(r => { dispute = r; return r; });
    const expiry = app.get(ExchangeExpiryWorker).tick(new Date(Date.parse(second.inspectionDeadline) + 1));
    try { await gate.contended(2); } finally { await gate.close(); }
    await Promise.all([pendingDispute, expiry]);
    const row = (await db.c.exchanges.findOne({ _id: ex.id }))!;
    if (dispute.status === 200) {
      expect(row.status).toBe('ResolutionPending');
      expect(row.completedAt).toBeNull();
    } else {
      expect(dispute.status).toBe(409);
      expect(row.status).toBe('Completed');
    }
    expect((await reconcile()).balanced).toBe(true);
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
    expect(comp2.body.status).toBe('Delivered');
    await worker.tick(new Date(Date.parse(comp2.body.inspectionDeadline) + 1));

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

  it('P8. Tự động tất toán khi hết thời hạn kiểm tra hàng 72 giờ (Inspection Window Expiry Worker)', async () => {
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
          method: 'direct',
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

    it('P1. Member dispute freezes 72h auto-settlement, keeping exchange in ResolutionPending', async () => {
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

      const secondLabel = (
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

      expect(secondLabel.status).toBe('Preparing');
      await carrierEvent('GHN-TRANSIT-1').expect(200);
      await carrierEvent('GHN-TRANSIT-2').expect(200);
      const inTransitRes = (await get('/exchanges/' + created.id, user1).expect(200)).body;
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

  describe('one-sided Exchange return', () => {
    const hour = 3_600_000;

    it('advances local exchange windows with the current version and the normal refund and return rules', async () => {
      const config = app.get(ConfigService);
      const flag = 'DEMO_EXCHANGE_DEADLINES_ENABLED';
      const allow = 'DEMO_EXCHANGE_MEMBER_IDS';
      const previous = [config.get<string>(flag), config.get<string>(allow)];
      const outsider = await reader();
      const unsent = await preparedExchange();
      const path = '/exchanges/' + unsent.id;
      const command = { expectedVersion: unsent.revision, deadline: 'Shipping' };
      try {
        config.set(flag, 'false');
        await post(path + '/demo-advance', command, user1).expect(404);
        config.set(flag, 'true');
        config.set(allow, [unsent.initiatorId, unsent.recipientId].join(','));
        expect((await get(path, user1).expect(200)).body.demoDeadline).toBe('Shipping');
        await post(path + '/demo-advance', command, outsider).expect(404);
        await post(path + '/demo-advance', { ...command, deadline: 'Inspection' }, user1).expect(409);
        const key = randomUUID();
        const [first, second] = await Promise.all([
          post(path + '/demo-advance', command, user1, key).expect(200),
          post(path + '/demo-advance', command, user1, key).expect(200),
        ]);
        expect(first.body).toEqual(second.body);
        expect(first.body).toMatchObject({ status: 'Cancelled', cancelReason: 'ShippingExpired' });

        const inTransit = await inTransitExchange();
        const transitPath = '/exchanges/' + inTransit.id;
        const late = (await post(transitPath + '/demo-advance', {
          deadline: 'Transit', expectedVersion: inTransit.revision,
        }, user2).expect(200)).body;
        expect(late).toMatchObject({ status: 'ResolutionPending', initiatorReceivedAt: null, recipientReceivedAt: null });

        const inspecting = await inTransitExchange();
        const inspectionPath = '/exchanges/' + inspecting.id;
        const firstReceipt = (await post(inspectionPath + '/receive', {
          expectedVersion: inspecting.revision,
        }, user1).expect(200)).body;
        const delivered = (await post(inspectionPath + '/receive', {
          expectedVersion: firstReceipt.revision,
        }, user2).expect(200)).body;
        const completed = (await post(inspectionPath + '/demo-advance', {
          deadline: 'Inspection', expectedVersion: delivered.revision,
        }, user1).expect(200)).body;
        expect(completed).toMatchObject({ status: 'Completed',
          initiatorReceivedAt: delivered.initiatorReceivedAt, recipientReceivedAt: delivered.recipientReceivedAt });

        const proposalA = await createApprovedListing(user1, 100000, 'Both');
        const proposalB = await createApprovedListing(user2, 100000, 'Both');
        const propose = async () => (await post('/exchanges', {
          initiatorListingId: proposalA.listingId, recipientListingId: proposalB.listingId,
        }, user1).expect(201)).body;
        const proposal = await propose();
        await post('/exchanges/' + proposal.id + '/demo-advance', {
          expectedVersion: proposal.revision, deadline: 'Proposal',
        }, user2).expect(200).expect(({ body }) => {
          expect(body).toMatchObject({ status: 'Cancelled', cancelReason: 'ProposalExpired' });
        });
        const anotherProposal = await propose();
        const fundingPath = '/exchanges/' + anotherProposal.id;
        await post(fundingPath + '/accept', { revision: anotherProposal.revision }, user2).expect(200);
        const fundedOnce = (await post(fundingPath + '/funding', {}, user1).expect(200)).body;
        await post(fundingPath + '/demo-advance', {
          expectedVersion: fundedOnce.revision, deadline: 'Funding',
        }, user2).expect(200).expect(({ body }) => {
          expect(body).toMatchObject({ status: 'Cancelled', cancelReason: 'FundingExpired', recipientFundedAt: null });
        });

        const ex = await preparedExchange();
        const member = '/exchanges/' + ex.id;
        const ops = '/operations/exchanges/' + ex.id;
        const sent = (await post(member + '/ship', { method: 'direct', expectedVersion: ex.revision }, user1).expect(200)).body;
        const received = (await post(member + '/receive', { expectedVersion: sent.revision }, user2).expect(200)).body;
        const dispute = (await post(member + '/demo-advance', {
          deadline: 'Shipping', expectedVersion: received.revision,
        }, user1).expect(200)).body;
        expect(dispute).toMatchObject({ status: 'ResolutionPending', canStartReturnResolution: true });
        await post(ops + '/demo-advance', { deadline: 'Evidence', expectedVersion: dispute.revision }, admin).expect(403);
        await post(ops + '/evidence-access', { expectedVersion: 0, reason: 'Kiểm tra tua hạn hồ sơ demo.' }, admin).expect(200);
        const note = 'Đối chiếu bằng chứng của hai bên.';
        const act = async (row: {revision:number}, action: string) => (await post(ops + '/return-resolution',
          { expectedVersion: row.revision, action, note }, admin).expect(200)).body;
        const skip = async (row: {revision:number}, deadline: string) => (await post(ops + '/demo-advance',
          { expectedVersion: row.revision, deadline }, admin).expect(200)).body;
        const evidence = await act(dispute, 'RequestEvidence');
        expect((await get(ops + '/dispute', admin).expect(200)).body.demoDeadline).toBe('Evidence');
        const ready = await skip(evidence, 'Evidence');
        const order = await act(ready, 'OrderReturn');
        const effective = await skip(order, 'Appeal');
        expect(Date.parse(effective.returnResolution.returnDueAt) - Date.parse(effective.returnResolution.appealDueAt)).toBe(72 * hour);
        const dispatched = (await post(member + '/return-resolution', {
          expectedVersion: effective.revision, action: 'ReportDispatch', trackingCode: 'QA-DEMO-RETURN',
        }, user2).expect(200)).body;
        const returned = (await post(member + '/return-resolution', {
          expectedVersion: dispatched.revision, action: 'AcknowledgeReturn',
        }, user1).expect(200)).body;
        const checked = await skip(returned, 'ReturnCheck');
        expect(checked.returnResolution.phase).toBe('CheckingReturn');
        expect((await act(checked, 'Settle')).returnResolution.outcome).toBe('Returned');

        const overdue = await preparedExchange();
        const returnMember = '/exchanges/' + overdue.id;
        const returnOps = '/operations/exchanges/' + overdue.id;
        const returnSent = (await post(returnMember + '/ship', {
          method: 'direct', expectedVersion: overdue.revision,
        }, user1).expect(200)).body;
        const returnReceived = (await post(returnMember + '/receive', {
          expectedVersion: returnSent.revision,
        }, user2).expect(200)).body;
        const returnDispute = (await post(returnMember + '/demo-advance', {
          deadline: 'Shipping', expectedVersion: returnReceived.revision,
        }, user1).expect(200)).body;
        await post(returnOps + '/evidence-access', {
          expectedVersion: 0, reason: 'Kiểm tra quá hạn bàn giao sách hoàn.',
        }, admin).expect(200);
        let state = returnDispute;
        for (const [endpoint, fields] of [
          ['return-resolution', { action: 'RequestEvidence', note }],
          ['demo-advance', { deadline: 'Evidence' }],
          ['return-resolution', { action: 'OrderReturn', note }],
          ['demo-advance', { deadline: 'Appeal' }],
          ['demo-advance', { deadline: 'Return' }],
        ] as const) {
          state = (await post(returnOps + '/' + endpoint, {
            expectedVersion: state.revision, ...fields,
          }, admin).expect(200)).body;
        }
        expect(state.returnResolution).toMatchObject({ phase: 'ReturnOrdered', trackingCode: null });
        await post(returnOps + '/return-resolution', {
          expectedVersion: state.revision, action: 'OrderCompensation', note,
          evidenceId: randomUUID(),
        }, admin).expect(422);
        expect((await reconcile()).balanced).toBe(true);
      } finally {
        config.set(flag, previous[0] ?? '');
        config.set(allow, previous[1] ?? '');
      }
    });

    it('refunds a carrier label-only exchange after the deadline and rejects pickup', async () => {
      const ex = await preparedExchange();
      const path = '/exchanges/' + ex.id;
      const label = (await post(path + '/ship', {
        expectedVersion: ex.revision, method: 'carrier', carrierCode: 'SIMULATOR', trackingCode: 'DEMO-ONE-LABEL',
      }, user1).expect(200)).body;
      expect(label).toMatchObject({ status: 'Preparing', initiatorShippedAt: null,
        initiatorShipment: { trackingCode: 'DEMO-ONE-LABEL', registeredAt: expect.any(String), shippedAt: null } });
      await post(path + '/receive', { expectedVersion: label.revision }, user2).expect(409);
      await carrierEvent('DEMO-ONE-LABEL').expect(409);
      await carrierEvent('DEMO-ONE-LABEL', 'DELIVERED').expect(409);
      await carrierEvent('DEMO-ONE-LABEL', 'UNKNOWN').expect(422);
      await request(app.getHttpServer()).get('/api/v1/shipments/carrier/orders/recent')
        .set('X-Forwarded-Host', 'example.com').expect(404);
      await request(app.getHttpServer()).post('/api/v1/shipments/carrier/seed-demo-order').expect(409);
      await request(app.getHttpServer()).post('/api/v1/shipments/carrier/orders/' + ex.id + '/auto-simulate').expect(409);
      const deadline = new Date(label.shippingDeadline);
      await worker.tick(new Date(+deadline + 1));
      await worker.tick(new Date(+deadline + 2));
      expect((await get(path, user1).expect(200)).body).toMatchObject({ status: 'Cancelled', cancelReason: 'ShippingExpired' });
      for (const id of [ex.l1.listingId, ex.l2.listingId])
        expect(await db.c.listings.findOne({ _id: id })).toMatchObject({ trade: 'Available' });
      const row = await db.c.exchanges.findOne({ _id: ex.id });
      expect(await db.c.ledger_journals.countDocuments({
        orderId: { $in: [row!.initiatorOrderId, row!.recipientOrderId] }, type: 'OrderRefund',
      })).toBe(2);
      expect((await reconcile()).balanced).toBe(true);
      await carrierEvent('DEMO-ONE-LABEL').expect(409);
    });

    it('keeps the money and both listings reserved when only one registered parcel was picked up', async () => {
      const ex = await preparedExchange();
      const path = '/exchanges/' + ex.id;
      const label = (await post(path + '/ship', {
        expectedVersion: ex.revision, method: 'carrier', trackingCode: 'DEMO-PICKUP-A',
      }, user1).expect(200)).body;
      await post(path + '/ship', { expectedVersion: label.revision, method: 'direct' }, user2).expect(409);
      await post(path + '/ship', {
        expectedVersion: label.revision, method: 'carrier', trackingCode: 'DEMO-PICKUP-B',
      }, user2).expect(200);
      await carrierEvent('DEMO-PICKUP-A', 'DELIVERED').expect(409);
      const results = await Promise.all([carrierEvent('DEMO-PICKUP-A').expect(200), carrierEvent('DEMO-PICKUP-A').expect(200)]);
      expect(results[0].body.nextStatus).toBe('Preparing');
      const picked = (await get(path, user1).expect(200)).body;
      expect(picked).toMatchObject({ revision: label.revision + 2, initiatorShippedAt: expect.any(String), recipientShippedAt: null });
      const before = await reconcile();
      await worker.tick(new Date(Date.parse(picked.shippingDeadline) + 1));
      expect((await get(path, user1).expect(200)).body.status).toBe('ResolutionPending');
      for (const id of [ex.l1.listingId, ex.l2.listingId])
        expect(await db.c.listings.findOne({ _id: id })).toMatchObject({ trade: 'Reserved' });
      expect(await reconcile()).toEqual(before);
    });

    it('advances only the configured demo deadline, once, without changing delivery evidence or funds', async () => {
      const ex = await preparedExchange(100000, 300000);
      const path = '/exchanges/' + ex.id;
      const endpoint = path + '/demo-advance-shipping';
      const config = app.get(ConfigService);
      const keys = ['DEMO_EXCHANGE_SHIPPING_ENABLED', 'DEMO_EXCHANGE_SHIPPING_IDS'] as const;
      const previous = keys.map(key => config.get<string>(key));
      const key = randomUUID();
      const before = await reconcile();
      try {
        config.set(keys[0], 'false');
        await post(endpoint, { expectedVersion: ex.revision }, user1).expect(404);
        config.set(keys[0], 'true');
        config.set(keys[1], ex.id);
        const sent = (await post(path + '/ship', {
          expectedVersion: ex.revision, method: 'direct', meetupLocation: 'Điểm hẹn QA',
        }, user1).expect(200)).body;
        const body = { expectedVersion: sent.revision };
        const outsider = await reader();
        expect((await get(path, user1).expect(200)).body.demoShippingAdvanceAvailable).toBe(true);
        expect((await get(path, user2).expect(200)).body.demoShippingAdvanceAvailable).toBeUndefined();
        await post(endpoint, body, user2).expect(403);
        await post(endpoint, body, outsider).expect(404);
        await post(endpoint, { expectedVersion: ex.revision }, user1).expect(409);
        const [first, second] = await Promise.all([
          post(endpoint, body, user1, key).expect(200),
          post(endpoint, body, user1, key).expect(200),
        ]);
        expect(first.body).toEqual(second.body);
        expect(first.body).toMatchObject({
          status: 'ResolutionPending',
          revision: sent.revision + 1,
          initiatorShippedAt: sent.initiatorShippedAt,
          recipientShippedAt: null,
          recipientReceivedAt: null,
          canVerifyOutboundDelivery: true,
        });
        expect(first.body.shippingDeadline).toBe(first.body.disputedAt);
        expect(Date.parse(first.body.shippingDeadline)).toBeLessThan(Date.parse(ex.shippingDeadline));
        expect(await reconcile()).toEqual(before);
        expect((await get('/operations/exchanges/' + ex.id + '/dispute', admin).expect(200)).body.status).toBe('ResolutionPending');
        expect((await get(path, user1).expect(200)).body.demoShippingAdvanceAvailable).toBeUndefined();
        await post(endpoint, { expectedVersion: first.body.revision }, user1).expect(409);
      } finally {
        keys.forEach((name, index) => config.set(name, previous[index] ?? ''));
      }
    });

    it('lets only the assigned Admin verify an unacknowledged delivery from case evidence', async () => {
      const ex = await preparedExchange(100000, 300000);
      const sent = (await post('/exchanges/' + ex.id + '/ship', {
        expectedVersion: ex.revision, method: 'direct', meetupLocation: 'Điểm QA',
      }, user1).expect(200)).body;
      const service = app.get(ExchangesService);
      const casePath = '/operations/exchanges/' + ex.id;
      const actionPath = casePath + '/return-resolution';
      const evidenceId = randomUUID();
      const body = { expectedVersion: sent.revision, action: 'VerifyOutboundDelivery',
        note: 'Đã đối chiếu người nhận và kiện sách với biên nhận.', evidenceId };
      await post(actionPath, body, admin).expect(403);
      const overdue = new Date(Date.parse(ex.shippingDeadline) + 1);
      const dispute = (await service.expireShipping(ex.id, overdue))!.exchange;
      expect(dispute).toMatchObject({ status: 'ResolutionPending', canVerifyOutboundDelivery: true });
      expect(dispute.canStartReturnResolution).toBeUndefined();
      await post('/exchanges/' + ex.id + '/return-resolution', body, user1).expect(403);
      const assign = (actor: Reader, expectedVersion: number) =>
        post(casePath + '/evidence-access', { expectedVersion, reason: 'Đối chiếu biên nhận giao sách.' }, actor);
      await assign(staff, 0).expect(200);
      await post(actionPath, { ...body, expectedVersion: dispute.revision }, staff).expect(403);
      await post(actionPath, { ...body, expectedVersion: dispute.revision }, admin).expect(403);
      await assign(admin, 1).expect(200);
      await post(actionPath, body, admin).expect(409);
      const command = { ...body, expectedVersion: dispute.revision };
      await post(actionPath, command, admin).expect(422);
      const uploadedAt = new Date();
      await db.c.exchange_evidence.insertOne({
        _id: evidenceId, exchangeId: ex.id, uploaderId: user1.id, fileName: 'bien-nhan-qa.png',
        mimeType: 'image/png', byteSize: 1, sha256: 'a'.repeat(64), reservedBytes: 1,
        status: 'Ready', version: 2, createdAt: uploadedAt, uploadedAt,
        createReceiptId: randomUUID(), uploadReceiptId: randomUUID(),
      });
      const before = await reconcile();
      const key = randomUUID();
      const results = await Promise.all([
        post(actionPath, command, admin, key),
        post(actionPath, command, admin, key),
      ]);
      for (const result of results) {
        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({ status: 'ResolutionPending', canStartReturnResolution: true,
          recipientReceivedAt: null, outboundDeliveryVerification: { note: body.note } });
      }
      const updated = results[0].body;
      expect(updated.revision).toBe(dispute.revision + 1);
      await post(actionPath, { ...command, note: 'Căn cứ khác cùng mã.' }, admin, key).expect(409);
      await post(actionPath, { ...command, expectedVersion: updated.revision }, admin).expect(409);
      await post('/exchanges/' + ex.id + '/receive', { expectedVersion: updated.revision }, user2).expect(409);
      const memberView = (await get('/exchanges/' + ex.id, user1).expect(200)).body;
      expect(memberView.outboundDeliveryVerification).toEqual(updated.outboundDeliveryVerification);
      expect(await reconcile()).toEqual(before);
      const requested = (await post(actionPath, {
        expectedVersion: updated.revision, action: 'RequestEvidence', note: 'Đề nghị hai bên bổ sung thông tin.',
      }, admin).expect(200)).body;
      expect(requested.returnResolution.phase).toBe('Evidence');
      expect(requested.outboundDeliveryVerification).toEqual(updated.outboundDeliveryVerification);
    });

    async function start({ compensation = false } = {}) {
      const ex = await preparedExchange(100000, 300000);
      const startTime = Date.now();
      const original = Tx.prototype.now;
      let clock = new Date(startTime);
      const time = vi.spyOn(Tx.prototype, 'now').mockImplementation(async function (this: Tx) {
        await original.call(this);
        return clock;
      });
      try {
        const sent = (await post('/exchanges/' + ex.id + '/ship', {
          expectedVersion: ex.revision, method: 'direct',
        }, user1).expect(200)).body;
        await post('/exchanges/' + ex.id + '/receive', { expectedVersion: sent.revision }, user1).expect(409);
        const received = (await post('/exchanges/' + ex.id + '/receive', {
          expectedVersion: sent.revision,
        }, user2).expect(200)).body;
        expect(received.status).toBe('Preparing');
        expect(received.recipientReceivedAt).toBeTruthy();
        clock = new Date(Date.parse(ex.shippingDeadline) + 1);
        await post('/exchanges/' + ex.id + '/ship', { expectedVersion: received.revision }, user2).expect(409);
        const dispute = compensation
          ? (await app.get(ExchangesService).expireShipping(ex.id, clock))!.exchange
          : (await post('/exchanges/' + ex.id + '/dispute', {
              expectedVersion: received.revision, reason: 'Bên kia đã nhận nhưng chưa gửi sách.',
            }, user1).expect(200)).body;
        expect(dispute).toMatchObject({ status: 'ResolutionPending', canStartReturnResolution: true });
        const casePath = '/operations/exchanges/' + ex.id + '/dispute';
        const opsPath = '/operations/exchanges/' + ex.id + '/return-resolution';
        const memberPath = '/exchanges/' + ex.id + '/return-resolution';
        const act = (path: string, actor: Reader, rev: number, action: string, extra: object = {}, key?: string) =>
          post(path, { expectedVersion: rev, action, ...extra }, actor, key);
        const note = { note: 'Đối chiếu thông tin từng chặng của giao dịch.' };
        await get(casePath, user1).expect(403);
        await act(opsPath, admin, dispute.revision, 'RequestEvidence', note).expect(403);
        await post('/operations/exchanges/' + ex.id + '/evidence-access', {
          expectedVersion: 0, reason: 'Tiếp nhận hồ sơ trả sách.',
        }, admin).expect(200);
        const requested = (await act(opsPath, admin, dispute.revision, 'RequestEvidence', note).expect(200)).body;
        await act(opsPath, admin, requested.revision, 'OrderReturn', note).expect(409);
        await act(memberPath, user1, requested.revision, 'Settle').expect(403);
        clock = new Date(+clock + 48 * hour);
        const order = (await act(opsPath, admin, requested.revision, 'OrderReturn', note).expect(200)).body;
        await act(memberPath, user2, order.revision, 'ReportDispatch', { trackingCode: 'QA-RETURN' }).expect(409);
        await act(opsPath, admin, order.revision, 'Settle').expect(409);

        const version = order.revision;
        if (compensation) {
          const appeal = (await act(memberPath, user2, version, 'Appeal', note).expect(200)).body;
          await act(memberPath, user2, appeal.revision, 'Appeal', note).expect(409);
          clock = new Date(+clock + 48 * hour);
          await act(opsPath, admin, appeal.revision, 'Uphold', note).expect(403);
          const secondAdmin = await reader(['ADMIN']);
          await post('/operations/exchanges/' + ex.id + '/evidence-access', {
            expectedVersion: 1, reason: 'Nhận lại để xét kháng nghị độc lập.',
          }, secondAdmin).expect(200);
          const finalReturn = (await act(opsPath, secondAdmin, appeal.revision, 'Uphold', note).expect(200)).body;
          expect(Date.parse(finalReturn.returnResolution.returnDueAt) - +clock).toBe(72 * hour);
          const claimed = (await act(memberPath, user2, finalReturn.revision, 'ReportDispatch',
            { trackingCode: 'QA-LABEL-ONLY' }).expect(200)).body;
          clock = new Date(+clock + 72 * hour);
          await act(opsPath, secondAdmin, claimed.revision, 'OrderCompensation', { ...note, evidenceId: randomUUID() }).expect(409);
          await act(opsPath, secondAdmin, claimed.revision, 'RejectReturnDispatch', { ...note, evidenceId: randomUUID() }).expect(422);
          const evidence = await db.c.exchange_evidence.insertOne({
            _id: randomUUID(), exchangeId: ex.id, uploaderId: user1.id, fileName: 'return-evidence.png',
            mimeType: 'image/png', byteSize: 1, sha256: 'a'.repeat(64), reservedBytes: 1,
            status: 'Ready', version: 2, createdAt: clock, uploadedAt: clock, createReceiptId: randomUUID(),
            uploadReceiptId: randomUUID(),
          });
          const invalidDispatch = (await act(opsPath, secondAdmin, claimed.revision, 'RejectReturnDispatch',
            { ...note, evidenceId: evidence.insertedId }).expect(200)).body;
          expect(invalidDispatch.returnResolution.trackingCode).toBeNull();
          const decision = (await act(opsPath, secondAdmin, invalidDispatch.revision, 'OrderCompensation',
            { ...note, evidenceId: evidence.insertedId }).expect(200)).body;
          expect(decision.returnResolution.compensation).toBe(100000);
          await act(opsPath, secondAdmin, decision.revision, 'Settle').expect(409);
          clock = new Date(+clock + 48 * hour);
          const keys = [randomUUID(), randomUUID()];
          const gate = await Gate.lock(db.client, 'exchanges', [ex.id]);
          const racing = keys.map((key) => act(opsPath, secondAdmin, decision.revision, 'Settle', {}, key).then((result) => result));
          try { await gate.contended(); } finally { await gate.close(); }
          const responses = await Promise.all(racing);
          expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
          const committedIndex = responses.findIndex((response) => response.status === 200);
          const committed = responses[committedIndex];
          const replay = await act(opsPath, secondAdmin, decision.revision, 'Settle', {}, keys[committedIndex]).expect(200);
          expect(replay.headers['idempotency-replayed']).toBe('true');
          expect(replay.body).toEqual(committed.body);
          expect(committed.body.returnResolution.outcome).toBe('Compensated');
          expect(await db.c.member_violations.countDocuments({ kind: 'ExchangeReturnDefault', sourceId: ex.id, userId: user2.id })).toBe(1);
        } else {
          clock = new Date(+clock + 48 * hour);
          await act(memberPath, user1, version, 'ReportDispatch', { trackingCode: 'QA-RETURN' }).expect(409);
          await act(memberPath, user2, version, 'ReportDispatch', { trackingCode: 'ABC' }).expect(422);
          const sentBack = (await act(memberPath, user2, version, 'ReportDispatch', { trackingCode: 'QA-RETURN' }).expect(200)).body;
          await act(memberPath, user2, sentBack.revision, 'AcknowledgeReturn').expect(409);
          await act(opsPath, admin, sentBack.revision, 'Settle').expect(409);
          const returned = (await act(memberPath, user1, sentBack.revision, 'AcknowledgeReturn').expect(200)).body;
          await act(opsPath, admin, returned.revision, 'Settle').expect(409);
          clock = new Date(+clock + 48 * hour);
          const result = await act(opsPath, admin, returned.revision, 'Settle').expect(200);
          expect(result.body.returnResolution.outcome).toBe('Returned');
          expect(await db.c.member_violations.countDocuments({ sourceId: ex.id })).toBe(0);
        }
        clock = new Date(startTime);
        const history = (await get('/me/wallet/history?limit=20', user1).expect(200)).body.items;
        const holderHistory = (await get('/me/wallet/history?limit=20', user2).expect(200)).body.items;
        expect(holderHistory.find((item: { type: string }) => item.type === 'ExchangeReturnRefund')?.amount)
          .toBe(compensation ? undefined : 100000);
        expect(history.find((item: { type: string }) => item.type === 'ExchangeReturnRefund')?.amount).toBe(500000);
        expect(history.find((item: { type: string }) => item.type === 'ExchangeNonReturnCompensation')?.amount)
          .toBe(compensation ? 100000 : undefined);
        expect(await db.c.listings.findOne({ _id: ex.l1.listingId })).toMatchObject(compensation
          ? { trade: 'ClosedUnavailable' }
          : { trade: 'Available', moderation: 'Draft' });
        expect(await db.c.listings.findOne({ _id: ex.l2.listingId })).toMatchObject({ trade: 'Available' });
        const closed = (await get(casePath, admin).expect(200)).body;
        expect(closed.returnResolution.phase).toBe('Closed');
        expect((await reconcile()).balanced).toBe(true);
      } finally {
        time.mockRestore();
      }
    }

    it('requires confirmed return and inspection before refunding 500,000 and 100,000', async () => {
      await start();
    });
    it('requires an independent appeal decision and pays 100,000 once from the holder deposit', async () => {
      await start({ compensation: true });
    });
  });

  describe('Exchange resolution safety (ADR 0057)', () => {
    async function disputedExchange(received = false) {
      // Total hold 600,000 exceeds the Staff authority limit of 300,000.
      let ex = await inTransitExchange(300000, 200000);
      if (received) {
        ex = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user1).expect(200)).body;
        ex = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user2).expect(200)).body;
      }
      return (await post(`/exchanges/${ex.id}/dispute`, {
        expectedVersion: ex.revision, reason: 'QA: cần đối chiếu tình trạng và nơi giữ sách.',
      }, user1).expect(200)).body;
    }
    async function effects(id: string) {
      const ex = (await db.c.exchanges.findOne({ _id: id }))!;
      const listingIds = [...(ex.initiatorListingIds ?? [ex.initiatorListingId]), ex.recipientListingId];
      const orders = [ex.initiatorOrderId, ex.recipientOrderId];
      const accounts = (await db.c.wallet_accounts.find({
        $or: [{ ownerId: { $in: [ex.initiatorId, ex.recipientId] } }, { orderId: { $in: orders } }],
      }).toArray()).map(a => a._id);
      return {
        exchange: ex,
        listings: await db.c.listings.find({ _id: { $in: listingIds } }).sort({ _id: 1 }).toArray(),
        entries: await db.c.ledger_entries.find({ accountId: { $in: accounts } }).sort({ _id: 1 }).toArray(),
        journals: await db.c.ledger_journals.find({ orderId: { $in: orders } }).sort({ _id: 1 }).toArray(),
        receipts: await db.c.mutation_receipts.find({ operation: 'resolveExchangeDispute', listingId: ex.initiatorListingId }).sort({ _id: 1 }).toArray(),
        audits: await db.c.audit_events.find({ action: 'resolveExchangeDispute', listingId: ex.initiatorListingId }).sort({ _id: 1 }).toArray(),
        messages: await db.c.exchange_messages.find({ exchangeId: id }).sort({ _id: 1 }).toArray(),
        notifications: await db.c.member_notifications.find({ targetType: 'Exchange', targetId: id }).sort({ _id: 1 }).toArray(),
      };
    }
    const decisionBody = (revision: number, decision = 'RefundBoth') => ({
      expectedVersion: revision, decision, reason: 'QA: yêu cầu xử lý phải giữ nguyên mọi nguồn tiền và sách.',
    });
    async function historicalReceipt(actor: Reader, ex: any, body: object) {
      const key = randomUUID();
      // A stored legacy receipt fixture tests recovery only. It grants no new
      // decision and never fabricates ledger effects via the command under test.
      await db.c.mutation_receipts.insertOne({
        _id: randomUUID(), principal: `user:${actor.id}`, actorId: actor.id, systemActor: null,
        operation: 'resolveExchangeDispute', key,
        payloadHash: createHash('sha256').update(canonicalJson({ operation: 'resolveExchangeDispute', target: ex.id, body })).digest('hex'),
        listingId: ex.initiatorListingId, bookId: null, mediaId: null, addressBookId: null,
        quoteId: null, contextId: null, topupId: null,
        resultVersion: ex.revision, result: ex, committedAt: new Date(),
      });
      return key;
    }

    it('rejects a Member and a missing target without disclosing a case', async () => {
      await get('/operations/exchanges/resolutions', user1).expect(403);
      await post(`/operations/exchanges/${randomUUID()}/resolve`, decisionBody(1), user1).expect(403);
      await post(`/operations/exchanges/${randomUUID()}/resolve`, decisionBody(1), staff).expect(404);
    });

    it('returns only participant display fields to independent operations readers', async () => {
      const ex = await disputedExchange();
      const expected = await Promise.all([ex.initiatorId, ex.recipientId].map(async (id: string) => {
        const user = await db.c.users.findOne({ _id: id });
        return { displayName: user!.displayName, avatarId: user!.avatarId ?? null };
      }));
      const participants = { initiator: expected[0], recipient: expected[1] };
      const path = '/operations/exchanges/' + ex.id + '/dispute';
      expect((await get(path, admin).expect(200)).body.participants).toEqual(participants);
      const queue = (await get('/operations/exchanges/resolutions', staff).expect(200)).body;
      expect(queue.find((row: { id: string }) => row.id === ex.id).participants).toEqual(participants);
      expect((await get('/exchanges/' + ex.id, user1).expect(200)).body).not.toHaveProperty('participants');
      await get(path, user1).expect(403);
    });

    it.each([false, true])('rejects new legacy decisions without changing holds or listings; received=%s', async received => {
      const ex = await disputedExchange(received);
      const decision = received ? 'CompleteExchange' : 'RefundBoth';
      const before = await effects(ex.id);
      await post('/operations/exchanges/' + ex.id + '/resolve', decisionBody(ex.revision, decision), staff).expect(409);
      await post('/operations/exchanges/' + ex.id + '/resolve', decisionBody(ex.revision, decision), admin).expect(409);
      expect(await effects(ex.id)).toEqual(before);
    });

    it('blocks Staff and Admin participants before even replaying a legacy receipt; filters their queue', async () => {
      const ex = await disputedExchange();
      for (const participant of [user1, user2]) {
        for (const role of ['STAFF', 'ADMIN'] as const) {
          await db.addRole(participant.id, role);
          const body = decisionBody(ex.revision);
          const key = await historicalReceipt(participant, ex, body);
          const before = await effects(ex.id);
          const response = await post(`/operations/exchanges/${ex.id}/resolve`, body, participant, key).expect(403);
          expect(response.body.code).toBe('SelfReviewForbidden');
          const queue = (await get('/operations/exchanges/resolutions', participant).expect(200)).body;
          expect(queue.some((item: { id: string }) => item.id === ex.id)).toBe(false);
          expect(await effects(ex.id)).toEqual(before);
          await db.removeRole(participant.id, role);
        }
      }
    });

    it('preserves legacy receipt recovery without repeating effects; rejects changed body, lost role and revoked session', async () => {
      let ex = await inTransitExchange();
      ex = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user1).expect(200)).body;
      ex = (await post(`/exchanges/${ex.id}/receive`, { expectedVersion: ex.revision }, user2).expect(200)).body;
      await worker.tick(new Date(Date.parse(ex.inspectionDeadline) + 1));
      ex = (await get(`/exchanges/${ex.id}`, user1).expect(200)).body;
      expect(ex.status).toBe('Completed');
      const reviewer = await reader(['STAFF']);
      const body = decisionBody(ex.revision - 1, 'CompleteExchange');
      const key = await historicalReceipt(reviewer, ex, body);
      const before = await effects(ex.id);
      for (let i = 0; i < 2; i++) {
        const replay = await post(`/operations/exchanges/${ex.id}/resolve`, body, reviewer, key).expect(200);
        expect(replay.body).toEqual(ex);
        expect(replay.headers['idempotency-replayed']).toBe('true');
      }
      await post(`/operations/exchanges/${ex.id}/resolve`, { ...body, reason: 'QA: khác nội dung đã lưu.' }, reviewer, key).expect(409);
      await db.removeRole(reviewer.id, 'STAFF');
      await post(`/operations/exchanges/${ex.id}/resolve`, body, reviewer, key).expect(403);
      await db.addRole(reviewer.id, 'STAFF');
      await db.c.auth_sessions.updateOne({ _id: reviewer.sessionId }, { $set: { revokedAt: new Date() } });
      await post(`/operations/exchanges/${ex.id}/resolve`, body, reviewer, key).expect(401);
      expect(await effects(ex.id)).toEqual(before);
      expect((await reconcile()).balanced).toBe(true);
    });

    it('retains consistency under contended opposite decisions and inspection expiry', async () => {
      const ex = await disputedExchange(true);
      const before = await effects(ex.id);
      const gate = await Gate.lock(db.client, 'exchanges', [ex.id]);
      const refund = post(`/operations/exchanges/${ex.id}/resolve`, decisionBody(ex.revision), staff).then(r => r);
      const complete = post(`/operations/exchanges/${ex.id}/resolve`, decisionBody(ex.revision, 'CompleteExchange'), admin).then(r => r);
      const expiry = app.get(ExchangesService).expireInspection(ex.id, new Date(Date.now() + 20 * 86400000));
      try { await gate.contended(); } finally { await gate.close(); }
      const [r1, r2, swept] = await Promise.all([refund, complete, expiry]);
      expect([r1.status, r2.status]).toEqual([409, 409]);
      expect(swept).toBeNull();
      const after = await effects(ex.id);
      // The worker takes and commits a lock even when inspection is ineligible.
      expect(after).toEqual({ ...before, exchange: { ...before.exchange, lockSeq: before.exchange.lockSeq + 1 } });
      expect((await reconcile()).balanced).toBe(true);
    });

    it('rechecks Staff authority after real contention before legacy replay', async () => {
      const ex = await disputedExchange();
      const reviewer = await reader(['STAFF']);
      const body = decisionBody(ex.revision);
      const key = await historicalReceipt(reviewer, ex, body);
      const gate = await Gate.lockUser(db.client, reviewer.id);
      const pending = post(`/operations/exchanges/${ex.id}/resolve`, body, reviewer, key).then(r => r);
      try {
        await gate.contended();
        await gate.db.collection<UserDoc>('users').updateOne({ _id: reviewer.id }, {
          $pull: { roles: { role: 'STAFF' } },
        }, { session: gate.session });
        await gate.commit();
      } catch (error) { await gate.close(); throw error; }
      expect((await pending).status).toBe(403);
      expect((await db.c.exchanges.findOne({ _id: ex.id }))?.status).toBe('ResolutionPending');
      expect((await reconcile()).balanced).toBe(true);
    });
  });

  describe('Mutual cancellation before shipping (Preparing state)', () => {
    it('1. Initiator requests cancel, cannot repeat request, then Recipient accepts -> MutualAgreement cancellation with full refund and listing release', async () => {
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
      const funded = (
        await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200)
      ).body;

      expect(funded.status).toBe('Preparing');

      // User1 (Initiator) requests cancellation before shipping
      const req1 = (
        await post(
          `/exchanges/${created.id}/cancel`,
          { expectedVersion: funded.revision },
          user1,
        ).expect(200)
      ).body;

      expect(req1.status).toBe('Preparing');
      expect(req1.cancellationRequestedBy).toBe('Initiator');
      expect(req1.cancellationRequestedAt).toBeDefined();

      // User1 repeats the cancellation request -> 409 InvalidState
      await post(
        `/exchanges/${created.id}/cancel`,
        { expectedVersion: req1.revision },
        user1,
      ).expect(409);

      // User2 (Recipient) confirms the cancellation -> Mutual Agreement reached!
      const cancelled = (
        await post(
          `/exchanges/${created.id}/cancel`,
          { expectedVersion: req1.revision },
          user2,
        ).expect(200)
      ).body;

      expect(cancelled.status).toBe('Cancelled');
      expect(cancelled.cancelReason).toBe('MutualAgreement');
      expect(cancelled.cancelledBy).toBe('Both');

      // Verify listings released back to Available
      const l1Doc = await db.c.listings.findOne({ _id: l1.listingId });
      const l2Doc = await db.c.listings.findOne({ _id: l2.listingId });
      expect(l1Doc?.trade).toBe('Available');
      expect(l2Doc?.trade).toBe('Available');

      // Ledger invariant: all holds refunded, balanced ledger
      const rec = await reconcile();
      expect(rec.balanced).toBe(true);
    });

    it('2. Initiator requests cancel, Recipient rejects -> cancellation request cleared, state stays Preparing', async () => {
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
      const funded = (
        await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200)
      ).body;

      // User1 requests cancel
      const req = (
        await post(
          `/exchanges/${created.id}/cancel`,
          { expectedVersion: funded.revision },
          user1,
        ).expect(200)
      ).body;
      expect(req.cancellationRequestedBy).toBe('Initiator');

      // User2 rejects the cancellation request
      const rejected = (
        await post(
          `/exchanges/${created.id}/reject`,
          {
            expectedVersion: req.revision,
            reason: 'Tôi đã đóng gói sách và muốn hoàn thành giao dịch.',
          },
          user2,
        ).expect(200)
      ).body;

      expect(rejected.status).toBe('Preparing');
      expect(rejected.cancellationRequestedBy).toBeNull();
      expect(rejected.cancellationRequestedAt).toBeNull();
    });

    it('3. Initiator requests cancel, Recipient ships directly -> shipping succeeds, cancellation request cleared', async () => {
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
      const funded = (
        await post(`/exchanges/${created.id}/funding`, {}, user2).expect(200)
      ).body;

      // User1 requests cancel
      const req = (
        await post(
          `/exchanges/${created.id}/cancel`,
          { expectedVersion: funded.revision },
          user1,
        ).expect(200)
      ).body;
      expect(req.cancellationRequestedBy).toBe('Initiator');

      // User2 ships book directly
      const shipped = (
        await post(
          `/exchanges/${created.id}/ship`,
          {
            expectedVersion: req.revision,
            method: 'direct',
          },
          user2,
        ).expect(200)
      ).body;

      expect(shipped.recipientShippedAt).toEqual(expect.any(String));
      expect(shipped.cancellationRequestedBy).toBeNull();

      // Once shipped, neither party can cancel
      await post(
        `/exchanges/${created.id}/cancel`,
        { expectedVersion: shipped.revision },
        user1,
      ).expect(409);
    });
  });
});

