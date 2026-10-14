import sharp from 'sharp';
import { digest } from '../src/modules/media/media-storage.js';

import { OrderClock } from '../src/modules/orders/order-clock.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';

import { OrdersService } from '../src/modules/orders/orders.service.js';

import { OrderExpiryWorker } from '../src/modules/orders/order-expiry.service.js';
import { checkOrder } from '../src/modules/orders/order-invariants.js';

import type { Wire } from '../src/modules/commands/domain-error.js';

import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import {
  applyCollectionSpecs,
  currentCollections,
} from '../src/database/mongo/migrations/index.js';
import {
  onTransactionRetry,
  type Tx,
} from '../src/database/mongo/transaction.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import request from 'supertest';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// Storage is an explicit in-memory fake, never live-provider evidence. Sharp/HTTP/DB are real.
const objects = new Map<string, Buffer>();
const storage = {
  failCheck: false,
  afterPut: undefined as ((key: string) => Promise<void>) | undefined,
  async put(key: string, bytes: Buffer, _mime: string) {
    const old = objects.get(key);
    if (old && digest(old) !== digest(bytes)) throw new Error('No overwrite');
    objects.set(key, Buffer.from(bytes));
    await this.afterPut?.(key);
  },
  async remove(keys: string[]) {
    for (const key of keys) objects.delete(key);
  },
  beforeSign: undefined as (() => Promise<void>) | undefined,
  async check() {
    if (this.failCheck) throw new Error('storage unavailable');
  },
  async signedRead(key: string) {
    await this.beforeSign?.();
    return {
      url: 'https://storage.test/' + key,
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
  },
};

type Reader = { id: string; token: string; sessionId: string; email: string };
const metadata = (title = 'Đường sách chuyền tay') => ({
  title,
  authors: ['Người viết'],
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
// Lock artefacts (MongoDB write-locks bump lockSeq where PostgreSQL took
// FOR UPDATE without changing the row) are not business state.
const unlocked = <T extends { lockSeq?: number }>(doc: T | null) => {
  if (!doc) return doc;
  const { lockSeq: _lockSeq, ...rest } = doc;
  return rest;
};
// The collections PostgreSQL migration 20260928070000 created or whose
// constraints it replaced (receipt/audit principal rules for the new system
// actor, the delivery-candidate index on carrier pickup events).
const DELIVERY_COLLECTIONS = [
  'order_delivery_reviews',
  'order_non_receipt_reports',
  'carrier_pickup_events',
  'mutation_receipts',
  'audit_events',
];

describe('Delivery overdue: real MongoDB and HTTP', () => {
  let app: INestApplication, db: MongoFixtures;
  const users: string[] = [];
  let upgradeBefore: Record<string, unknown>,
    upgradeAfter: Record<string, unknown>;
  let legacy: PaymentFixture;
  let legacyEvidence: Awaited<ReturnType<typeof reserved>>;
  let m1: Reader, a1: Reader, a2: Reader, staff: Reader, operator: Reader;
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
    const email = `${randomUUID()}@draft-http.test`;
    const user = await db.user({
      email,
      displayName: 'Bạn đọc thử nghiệm',
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
  // Direct user/session writes bump lockSeq like every application writer.
  const setUser = (ids: string[], set: Record<string, unknown>) =>
    db.c.users.updateMany(
      { _id: { $in: ids } },
      { $set: { ...set, updatedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
  const setSessions = (ids: string[], set: Record<string, unknown>) =>
    db.c.auth_sessions.updateMany(
      { _id: { $in: ids } },
      { $set: set, $inc: { lockSeq: 1 } },
    );
  async function createCatalog(actor = m1, meta = metadata()) {
    const result = await post(
      '/catalog/requests',
      { metadata: meta },
      actor,
    ).expect(200);
    validates('MutationReceipt', result.body);
    return result.body;
  }
  function confirm(created: Record<string, any>, actor = a1) {
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
  async function createDraft(actor = m1, content = draft()) {
    const result = await post('/listings', { content }, actor).expect(200);
    validates('MutationReceipt', result.body);
    return result.body;
  }
  async function makeApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    const next = module.createNestApplication();
    next
      .get(ConfigService)
      .set('PAYMENT_SIMULATOR_SECRET', process.env.PAYMENT_SIMULATOR_SECRET);
    configureApp(next, { docs: false, logRequests: false });
    await next.init();
    // One listening socket per app lifetime (see orders.e2e-spec.ts): the
    // concurrent requests below must not race supertest's per-request server.
    await next.listen(0, '127.0.0.1');
    return next;
  }
  // Observes command transactions retrying against a write lock held by
  // another transaction (a session queued behind a PostgreSQL row lock).
  function watchRetries() {
    const seen = new Set<number>();
    const stop = onTransactionRetry((event) => seen.add(event.transactionId));
    return {
      stop,
      async until(n = 1) {
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
          if (seen.size >= n) return;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new Error('Commands did not reach the lock barrier');
      },
    };
  }
  // Test-only pause of the first command that acquires the Order's ledger
  // locks, inside its transaction and while it still holds the participant,
  // Order and ledger locks. PostgreSQL granted queued row locks in FIFO
  // order; MongoDB aborts and retries the loser, so the intended winner is
  // made explicit by holding it here.
  function pauseAtLedger() {
    const ledger = app.get(LedgerService),
      original = ledger.lockOrder.bind(ledger);
    let entered!: () => void,
      release!: () => void,
      paused = false;
    const reached = new Promise<void>((resolve) => (entered = resolve)),
      released = new Promise<void>((resolve) => (release = resolve));
    const spy = vi
      .spyOn(ledger, 'lockOrder')
      .mockImplementation(async (...args) => {
        const accounts = await original(...args);
        if (!paused) {
          paused = true;
          entered();
          await released;
        }
        return accounts;
      });
    return { reached, release, spy };
  }
  // Write-locks the Order's hold account, like the former
  // `SELECT ... FROM wallet_accounts WHERE order_id=$1 FOR UPDATE` barrier.
  async function lockLedger(f: PaymentFixture) {
    const hold = (await db.c.wallet_accounts.findOne({ orderId: f.id }))!;
    return Gate.lock(db.client, 'account_locks', [hold._id]);
  }
  // A 503 (retry budget exhausted under contention) is only an answer if the
  // same-key retry then yields the final outcome.
  async function settled(
    response: request.Response,
    retry: () => Promise<request.Response>,
  ) {
    return response.status === 503 ? retry() : response;
  }

  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    db = await MongoFixtures.connect();
    app = await makeApp();
    m1 = await reader();
    operator = await reader(['TEST_OPERATOR']);
    a1 = await reader(['MEMBER', 'ADMIN']);
    a2 = await reader(['ADMIN']);
    staff = await reader(['STAFF']);
    // Populated fulfillment storage with a real active reservation and posted
    // topup, built through the APIs: an InTransit Order with an Applied
    // pickup, an already overdue accepted Order with a pickup review, and a
    // conflicting-pickup review.
    legacy = await ready();
    await pay(legacy).expect(200);
    await accept(legacy).expect(200);
    legacyEvidence = await reserved(legacy);
    await upload(legacy, legacyEvidence.id, legacyEvidence.bytes).expect(200);
    await register(legacy, shipBody([legacyEvidence.id])).expect(200);
    const overdueLegacy = await accepted();
    const priorPreparation = (await db.c.order_preparations.findOne({
      _id: overdueLegacy.id,
    }))!;
    const priorClock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(priorPreparation.pickupDeadline);
    try {
      await app.get(OrdersService).expirePickup(overdueLegacy.id);
    } finally {
      priorClock.mockRestore();
    }
    const legacyShipment = (await db.c.direct_shipments.findOne({
      orderId: legacy.id,
    }))!;
    await emit({
      eventId: randomUUID(),
      shipmentId: legacyShipment._id,
      orderId: legacy.id,
      carrier: 'LatLaiSimulator',
      trackingCode: legacyShipment.trackingCode,
      type: 'PickedUp',
      occurredAt: new Date().toISOString(),
    }).expect(200);
    const conflictedLegacy = await labelled();
    await emit(conflictedLegacy.event).expect(200);
    await emit({
      ...conflictedLegacy.event,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
    }).expect(200);
    const snapshot = async () => {
      const rows: Record<string, unknown> = {};
      for (const name of [
        'carrier_pickup_events',
        'carrier_pickup_reviews',
        'direct_shipments',
        'shipment_packaging_evidence',
        'order_packaging_evidence',
        'order_preparations',
        'pickup_reviews',
        'direct_orders',
        'workflow_contexts',
        'exclusive_commitments',
        'agreement_snapshots',
        'mutation_receipts',
        'audit_events',
        'outbox_events',
        'wallet_accounts',
        'ledger_journals',
        'ledger_entries',
      ])
        rows[name] = await db.client
          .db()
          .collection(name)
          .find()
          .sort({ _id: 1 })
          .toArray();
      return rows;
    };
    // MongoDB has no delivery-overdue upgrade step (the collections are in
    // the baseline schema): re-apply their specs, as the migrator, to the
    // populated storage.
    upgradeBefore = await snapshot();
    await applyCollectionSpecs(
      db.client.db(),
      currentCollections().filter((s) => DELIVERY_COLLECTIONS.includes(s.name)),
    );
    upgradeAfter = await snapshot();
  }, 120000);
  afterAll(async () => {
    if (db) {
      const c = db.c;
      const orders = (
        await c.direct_orders.find({ buyerId: { $in: users } }).toArray()
      ).map((o) => o._id);
      const contexts = (
        await c.workflow_contexts.find({ orderId: { $in: orders } }).toArray()
      ).map((x) => x._id);
      const commitments = (
        await c.exclusive_commitments
          .find({ currentContextId: { $in: contexts } })
          .toArray()
      ).map((x) => x._id);
      const byOrder = { orderId: { $in: orders } };
      await c.order_non_receipt_reports.deleteMany(byOrder);
      await c.order_delivery_reviews.deleteMany(byOrder);
      await c.carrier_pickup_reviews.deleteMany(byOrder);
      await c.carrier_pickup_events.deleteMany(byOrder);
      await c.shipment_packaging_evidence.deleteMany(byOrder);
      await c.direct_shipments.deleteMany(byOrder);
      await c.order_packaging_evidence.deleteMany(byOrder);
      await c.pickup_reviews.deleteMany(byOrder);
      await c.order_preparations.deleteMany({ _id: { $in: orders } });
      await c.commitment_events.deleteMany({
        commitmentId: { $in: commitments },
      });
      await c.exclusive_commitments.deleteMany({ _id: { $in: commitments } });
      await c.agreement_snapshots.deleteMany({ _id: { $in: contexts } });
      await c.workflow_items.deleteMany({ contextId: { $in: contexts } });
      await c.workflow_contexts.deleteMany({ _id: { $in: contexts } });
      await c.direct_orders.deleteMany({ _id: { $in: orders } });
      await c.sale_quotes.deleteMany({ buyerId: { $in: users } });
      // Removing this suite's journals (topups, payments) and entries returns
      // the drained simulator funds; the opening journal is never touched.
      const topups = (
        await c.topup_intents.find({ ownerId: { $in: users } }).toArray()
      ).map((t) => t._id);
      const accounts = (
        await c.wallet_accounts
          .find({ $or: [{ ownerId: { $in: users } }, byOrder] })
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
      const listings = (
        await c.listings.find({ ownerId: { $in: users } }).toArray()
      ).map((l) => l._id);
      const revisions = (
        await c.listing_revisions
          .find({ listingId: { $in: listings } })
          .toArray()
      ).map((r) => r._id);
      const media = (
        await c.listing_media.find({ listingId: { $in: listings } }).toArray()
      ).map((m) => m._id);
      const books = (
        await c.catalog_books.find({ requesterId: { $in: users } }).toArray()
      ).map((b) => b._id);
      const bookRevisions = (
        await c.catalog_revisions.find({ bookId: { $in: books } }).toArray()
      ).map((r) => r._id);
      // Worker receipts/audits carry no actor; they join through the context.
      const history = {
        $or: [
          { actorId: { $in: users } },
          { contextId: { $in: contexts } },
          { topupId: { $in: topups } },
        ],
      };
      const audits = (await c.audit_events.find(history).toArray()).map(
        (a) => a._id,
      );
      await c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await c.audit_events.deleteMany({ _id: { $in: audits } });
      await c.mutation_receipts.deleteMany(history);
      await c.listing_decisions.deleteMany({ revisionId: { $in: revisions } });
      await c.revision_media.deleteMany({ listingId: { $in: listings } });
      await c.media_processing_jobs.deleteMany({ mediaId: { $in: media } });
      await c.listing_media.deleteMany({ _id: { $in: media } });
      await c.listing_revisions.deleteMany({ _id: { $in: revisions } });
      await c.listings.deleteMany({ _id: { $in: listings } });
      await c.catalog_decisions.deleteMany({
        revisionId: { $in: bookRevisions },
      });
      await c.catalog_revisions.deleteMany({ _id: { $in: bookRevisions } });
      await c.catalog_books.deleteMany({ _id: { $in: books } });
      await c.member_addresses.deleteMany({ ownerId: { $in: users } });
      await c.address_identities.deleteMany({ ownerId: { $in: users } });
      await c.address_books.deleteMany({ _id: { $in: users } });
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
    if (originalSecret === undefined)
      delete process.env.PAYMENT_SIMULATOR_SECRET;
    else process.env.PAYMENT_SIMULATOR_SECRET = originalSecret;
  });

  const checklist = {
    catalogMatches: true,
    photosClear: true,
    conditionDisclosed: true,
    readable: true,
    pricingValid: true,
    contentAppropriate: true,
  };
  async function asset(
    listingId: string,
    status: 'Ready' | 'Pending' = 'Ready',
  ) {
    const key = randomUUID(),
      now = new Date();
    // Fixture derivative only: not proof of upload/Sharp/live-provider behavior.
    const doc = {
      _id: randomUUID(),
      listingId,
      version: 1,
      status,
      stagingKey: key,
      pinnedKey: status === 'Ready' ? key + '/input' : null,
      derivativeKey: status === 'Ready' ? key + '/display.webp' : null,
      mimeType: 'image/jpeg',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      width: status === 'Ready' ? 20 : null,
      height: status === 'Ready' ? 20 : null,
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
  async function complete(
    actor = m1,
    confirmed = true,
    imageStatus: 'Ready' | 'Pending' = 'Ready',
    meta = metadata(),
  ) {
    const book = await createCatalog(actor, meta);
    if (confirmed)
      await confirm(book, actor.id === a1.id ? a2 : a1).expect(200);
    const l = await createDraft(actor, draft(book.entityId));
    const image = await asset(l.entityId, imageStatus);
    const content = {
      ...draft(book.entityId),
      mode: 'Sale',
      condition: 'Good',
      pages: 'Đủ trang',
      coverNote: 'Góc bìa hơi sờn',
      notes: 'Không ghi chú',
      accessories: 'Không có',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      description:
        'Sách đã đọc một lần, còn nguyên nội dung và đọc rõ từng trang.',
      salePrice: 120000,
      mediaIds: [image.id],
    };
    const saved = await put(
      l.entityId,
      { expectedVersion: l.version, content },
      actor,
    ).expect(200);
    return { ...saved.body, content, image, book };
  }
  const submit = (l: Record<string, any>, actor = m1, key = randomUUID()) =>
    post(
      `/listings/${l.entityId}/submit`,
      { expectedVersion: l.version, ownershipDeclared: true },
      actor,
      key,
    );
  const decide = (
    l: Record<string, any>,
    kind = 'Approve',
    actor = staff,
    key = randomUUID(),
  ) =>
    post(
      `/operations/listings/${l.entityId}/decision`,
      {
        expectedVersion: l.version,
        revisionId: l.revisionId,
        decision: kind,
        ...(kind === 'Approve'
          ? { checklist }
          : { reason: 'Ảnh chưa mô tả rõ tình trạng sách.' }),
      },
      actor,
      key,
    );
  const addressInput = {
    recipientName: 'Private quote recipient',
    phone: '0900123456',
    detail: 'Private quote address — simulator only',
    serviceAreaCode: 'HCM-DEMO-v1',
    localityCode: 'DEMO-A',
  };
  async function address(owner: Reader) {
    const b = (await get('/me/addresses', owner).expect(200)).body;
    const saved = (
      await post(
        '/me/addresses',
        {
          expectedBookVersion: b.version,
          address: {
            ...addressInput,
            detail: `Private contact location ${owner.id}`,
          },
          makeDefault: false,
        },
        owner,
      ).expect(200)
    ).body;
    return { id: saved.addressId, version: 1 };
  }
  async function setup(
    price = 200000,
    mode: 'Sale' | 'Both' = 'Sale',
    existingBuyer?: Reader,
  ) {
    const seller = await reader(),
      buyer = existingBuyer ?? (await reader()),
      l = await complete(seller);
    const origin = await address(seller),
      destination = await address(buyer);
    const saved = (
      await put(
        l.entityId,
        {
          expectedVersion: l.version,
          content: {
            ...l.content,
            salePrice: price,
            mode,
            exchangeValue: mode === 'Both' ? price : null,
            fulfillment: {
              originAddressId: origin.id,
              originAddressVersion: 1,
              method: 'DirectDelivery',
            },
          },
        },
        seller,
      ).expect(200)
    ).body;
    const sent = (await submit(saved, seller).expect(200)).body;
    const approved = (await decide(sent).expect(200)).body;
    return {
      seller,
      buyer,
      origin,
      destination,
      l: { ...l, ...approved },
      body: {
        expectedListingVersion: approved.version,
        expectedListingRevisionId: approved.revisionId,
        destinationAddressId: destination.id,
        expectedDestinationAddressVersion: 1,
        method: 'DirectDelivery',
      },
    };
  }
  type Fixture = Awaited<ReturnType<typeof setup>>;
  const quote = (
    f: Fixture,
    key = randomUUID(),
    body = f.body,
    buyer = f.buyer,
  ) => post(`/listings/${f.l.entityId}/quotes`, body, buyer, key);
  async function prepared(fixture?: Fixture) {
    const f = fixture ?? (await setup());
    const q = (await quote(f).expect(200)).body;
    return {
      f,
      body: {
        quoteId: q.entityId,
        expectedQuoteVersion: 1,
        expectedListingVersion: f.l.version,
        expectedListingRevisionId: f.l.revisionId,
      },
    };
  }
  const create = (
    p: Awaited<ReturnType<typeof prepared>>,
    key = randomUUID(),
    actor = p.f.buyer,
    body: object = p.body,
  ) => post('/orders', body, actor, key);
  async function orderView(id: string, actor: Reader) {
    const r = await get(`/me/orders/${id}`, actor).expect(200);
    validates('PrivateUnpaidOrder', r.body);
    expect(r.headers['cache-control']).toContain('no-store');
    return r.body;
  }
  // Windows and the QA container have separate clocks. Synthetic provider facts
  // use the database clock too; production still rejects pre-label/future facts.
  const fixtureNow = () => app.get(MongoService).tx((tx) => tx.now());
  async function fund(actor: Reader, amount = 500000) {
    const intent = (await post('/me/topups', { amount }, actor).expect(200))
      .body;
    await post(
      '/operations/simulator/topup-events',
      {
        eventId: randomUUID(),
        intentId: intent.entityId,
        recipientId: actor.id,
        amount,
        currency: 'VND',
        outcome: 'Succeeded',
        occurredAt: (await fixtureNow()).toISOString(),
      },
      operator,
    ).expect(200);
  }
  async function ready(amount = 500000, fixture?: Fixture) {
    const p = await prepared(fixture),
      r = (await create(p).expect(200)).body;
    if (amount) await fund(p.f.buyer, amount);
    return { ...p, r, id: r.entityId as string };
  }
  type PaymentFixture = Awaited<ReturnType<typeof ready>>;
  const pay = (
    f: PaymentFixture,
    key = randomUUID(),
    actor = f.f.buyer,
    version = 1,
  ) => post(`/orders/${f.id}/pay`, { expectedVersion: version }, actor, key);
  const reconcile = () =>
    app.get(MongoService).tx((tx) => app.get(LedgerService).reconcile(tx));

  const accept = (
    f: PaymentFixture,
    key = randomUUID(),
    actor = f.f.seller,
    version = 2,
  ) => post(`/orders/${f.id}/accept`, { expectedVersion: version }, actor, key);
  async function paid() {
    const f = await ready();
    await pay(f).expect(200);
    return f;
  }

  const base = (f: PaymentFixture) => `/orders/${f.id}/packaging-evidence`;
  async function image() {
    return sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: {
          r: Math.floor(Math.random() * 256),
          g: Math.floor(Math.random() * 256),
          b: Math.floor(Math.random() * 256),
        },
      },
    })
      .png()
      .withMetadata()
      .toBuffer();
  }
  function intent(
    f: PaymentFixture,
    bytes: Buffer,
    actor = f.f.seller,
    key = randomUUID(),
    version = 3,
  ) {
    return post(
      base(f),
      {
        expectedVersion: version,
        mimeType: 'image/png',
        byteSize: bytes.length,
        sha256: digest(bytes),
      },
      actor,
      key,
    );
  }
  function upload(
    f: PaymentFixture,
    id: string,
    bytes: Buffer,
    actor = f.f.seller,
    key = randomUUID(),
    mime = 'image/png',
  ) {
    return request(app.getHttpServer())
      .put(`/api/v1${base(f)}/${id}/content`)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .set('Content-Type', mime)
      .send(bytes);
  }
  async function accepted() {
    const f = await paid();
    await accept(f).expect(200);
    return f;
  }
  async function reserved(f: PaymentFixture) {
    const bytes = await image();
    const r = await intent(f, bytes).expect(200);
    validates('PackagingEvidenceReceipt', r.body);
    return { bytes, id: r.body.entityId as string, receipt: r.body };
  }
  afterEach(() => {
    storage.afterPut = undefined;
    storage.beforeSign = undefined;
    storage.failCheck = false;
    vi.restoreAllMocks();
    app.get(ConfigService).set('MEDIA_STORAGE_BUDGET_BYTES', 800000000);
  });

  const tracking = () => 'LL-' + randomUUID().replaceAll('-', '').toUpperCase();
  const shipBody = (ids: string[], code = tracking()) => ({
    expectedOrderVersion: 3,
    carrier: 'LatLaiSimulator',
    trackingCode: code,
    packagingEvidenceIds: ids,
  });
  const register = (
    f: PaymentFixture,
    body: object,
    actor = f.f.seller,
    key = randomUUID(),
  ) => post(`/orders/${f.id}/shipment`, body, actor, key);
  const shipment = (f: PaymentFixture, actor = f.f.buyer) =>
    get(`/me/orders/${f.id}/shipment`, actor);
  async function dispatchable() {
    const f = await accepted(),
      e = await reserved(f);
    await upload(f, e.id, e.bytes).expect(200);
    return { f, e, body: shipBody([e.id]) };
  }
  async function extendSession(f: PaymentFixture, now: Date) {
    await setSessions([f.f.seller.sessionId, f.f.buyer.sessionId], {
      expiresAt: new Date(now.getTime() + 86400000),
    });
  }
  async function labelled() {
    const { f, e, body } = await dispatchable();
    const s = (await register(f, body).expect(200)).body;
    return {
      f,
      e,
      s,
      event: {
        eventId: randomUUID(),
        shipmentId: s.entityId,
        orderId: f.id,
        carrier: 'LatLaiSimulator',
        trackingCode: body.trackingCode,
        type: 'PickedUp',
        occurredAt: (await fixtureNow()).toISOString(),
      } as Wire['SimulatedPickupEvent'],
    };
  }
  const emit = (
    event: Wire['SimulatedPickupEvent'],
    actor = operator,
    key = event.eventId,
  ) => post('/operations/simulator/pickup-events', event, actor, key);
  async function freeze(f: PaymentFixture, now: Date) {
    await extendSession(f, now);
    await setSessions([operator.sessionId], {
      expiresAt: new Date(now.getTime() + 86400000),
    });
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(now);
  }
  const description =
    'Tôi vẫn chưa nhận được sách và cần kiểm tra hành trình giao hàng.';
  const report = (
    f: PaymentFixture,
    version = 4,
    actor = f.f.buyer,
    key = randomUUID(),
    note = description,
  ) =>
    post(
      `/orders/${f.id}/non-receipt`,
      { expectedVersion: version, description: note },
      actor,
      key,
    );
  async function transit() {
    const fixture = await labelled();
    const r = await emit(fixture.event).expect(200);
    const p = (await db.c.carrier_pickup_events.findOne({
      _id: fixture.event.eventId,
    }))!;
    return { ...fixture, p, r: r.body };
  }
  async function overdue() {
    const x = await transit();
    await freeze(x.f, x.p.deliveryDeadline!);
    return x;
  }
  async function stable(f: PaymentFixture) {
    return {
      listing: unlocked(await db.c.listings.findOne({ _id: f.f.l.entityId })),
      commitment: unlocked(
        await db.c.exclusive_commitments.findOne({
          currentContextId: f.r.contextId,
        }),
      ),
      context: unlocked(
        await db.c.workflow_contexts.findOne({ _id: f.r.contextId }),
      ),
      ledger: await db.c.ledger_entries.find({}).sort({ _id: 1 }).toArray(),
      shipment: await db.c.direct_shipments.findOne({ orderId: f.id }),
    };
  }
  it('upgrades populated storage preserving actual Applied pickup and existing overdue reviews', async () => {
    expect(upgradeAfter).toEqual(upgradeBefore);
    expect(await orderView(legacy.id, legacy.f.buyer)).toMatchObject({
      state: 'InTransit',
      deliveryReview: null,
      canReportNonReceipt: false,
    });
    expect((await reconcile()).balanced).toBe(true);
  });
  it('worker opens exactly one durable delivery review at pinned deadline, retaining money/book/canonical pickup', async () => {
    const { f, p, event } = await overdue(),
      before = await stable(f);
    const r = await app.get(OrdersService).expireDelivery(f.id);
    validates('TransactionCommandReceipt', r.receipt);
    expect(r.receipt).toMatchObject({
      version: 5,
      state: 'ResolutionPending',
      affectedListings: [],
    });
    expect(await stable(f)).toEqual(before);
    const o = await orderView(f.id, f.f.buyer);
    expect(o).toMatchObject({
      version: 5,
      state: 'ResolutionPending',
      moneyHeld: 230000,
      carrierReview: null,
      canReportNonReceipt: true,
      deliveryReview: {
        openedBy: 'DeadlineWorker',
        status: 'Open',
        pickupEventId: event.eventId,
        deliveryDeadline: p.deliveryDeadline!.toISOString(),
        buyerReport: null,
      },
    });
    expect((await shipment(f).expect(200)).body.pickupConfirmed).toBe(true);
    const receipt = await db.c.mutation_receipts.findOne({
      _id: r.receipt.id,
    });
    expect(receipt).toMatchObject({
      actorId: null,
      systemActor: 'OrderDeliveryExpiry',
      key: f.id,
    });
    expect((await app.get(OrdersService).expireDelivery(f.id)).receipt).toEqual(
      r.receipt,
    );
    expect((await reconcile()).balanced).toBe(true);
  });
  it('Buyer report at deadline creates one review and report with no attachment dependency', async () => {
    const { f, p } = await overdue(),
      before = await stable(f);
    const r = await report(f).expect(200);
    validates('TransactionCommandReceipt', r.body);
    expect(r.body).toMatchObject({
      state: 'ResolutionPending',
      version: 5,
      affectedListings: [],
    });
    const view = await orderView(f.id, f.f.buyer);
    expect(view).toMatchObject({
      canReportNonReceipt: false,
      deliveryReview: {
        openedBy: 'BuyerReport',
        openedAt: p.deliveryDeadline!.toISOString(),
        buyerReport: { description },
      },
    });
    expect((await orderView(f.id, f.f.seller)).deliveryReview).toEqual(
      view.deliveryReview,
    );
    expect(await stable(f)).toEqual(before);
    const audit = await db.c.audit_events.findOne({
      receiptId: r.body.id,
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain(description);
    await expect(app.get(OrdersService).expireDelivery(f.id)).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
  it('Buyer supplements worker review without changing its opening identity or incrementing Order again', async () => {
    const { f } = await overdue();
    await app.get(OrdersService).expireDelivery(f.id);
    const before = await db.c.order_delivery_reviews.findOne({ orderId: f.id });
    await report(f, 4).expect(409);
    const r = await report(f, 5).expect(200);
    expect(r.body.version).toBe(5);
    expect(
      await db.c.order_delivery_reviews.findOne({ orderId: f.id }),
    ).toEqual(before);
    expect(
      await db.c.order_non_receipt_reports.countDocuments({ orderId: f.id }),
    ).toBe(1);
    await report(f, 5).expect(409);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('T-1ms rejects worker and Buyer; exact deadline opens and late worker does not extend it', async () => {
    const { f, p } = await transit();
    await freeze(f, new Date(p.deliveryDeadline!.getTime() - 1));
    expect((await orderView(f.id, f.f.buyer)).canReportNonReceipt).toBe(false);
    await report(f).expect(409);
    await expect(app.get(OrdersService).expireDelivery(f.id)).rejects.toThrow();
    vi.mocked(app.get(OrderClock).now).mockResolvedValue(p.deliveryDeadline!);
    expect((await orderView(f.id, f.f.buyer)).canReportNonReceipt).toBe(true);
    await report(f).expect(200);
    expect(
      (await orderView(f.id, f.f.buyer)).deliveryReview.deliveryDeadline,
    ).toBe(p.deliveryDeadline!.toISOString());
  });
  it('denies guest, Seller, outsider and generic operations roles', async () => {
    const { f } = await overdue();
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${f.id}/non-receipt`)
      .send({ expectedVersion: 4, description })
      .expect(401);
    for (const actor of [f.f.seller, m1, a1])
      await report(f, 4, actor).expect(404);
    for (const actor of [staff, a2, operator])
      await report(f, 4, actor).expect(403);
    await post(
      `/orders/${randomUUID()}/non-receipt`,
      { expectedVersion: 4, description },
      f.f.buyer,
    ).expect(404);
    expect(
      await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
    ).toBe(0);
  });
  it.each(['LOCKED', 'RESTRICTED'] as const)(
    'Buyer %s retains reporting and both participant reads',
    async (status) => {
      const { f } = await overdue();
      await setUser([f.f.buyer.id, f.f.seller.id], { status });
      await report(f).expect(200);
      expect(
        (await orderView(f.id, f.f.buyer)).deliveryReview.buyerReport
          .description,
      ).toBe(description);
      expect((await orderView(f.id, f.f.seller)).canReportNonReceipt).toBe(
        false,
      );
      await report(f, 5, f.f.seller).expect(404);
    },
  );
  it.each(['unverified', 'disabled', 'revoked', 'role'] as const)(
    'denies %s Buyer even before receipt replay',
    async (kind) => {
      const { f } = await overdue(),
        key = randomUUID();
      await report(f, 4, f.f.buyer, key).expect(200);
      if (kind === 'unverified')
        await setUser([f.f.buyer.id], { emailVerifiedAt: null });
      if (kind === 'disabled')
        await setUser([f.f.buyer.id], { status: 'DISABLED' });
      if (kind === 'revoked')
        await setSessions([f.f.buyer.sessionId], { revokedAt: new Date() });
      if (kind === 'role') await db.removeRole(f.f.buyer.id, 'MEMBER');
      const r = await report(f, 4, f.f.buyer, key);
      expect([401, 403]).toContain(r.status);
      expect(
        await db.c.order_non_receipt_reports.countDocuments({ orderId: f.id }),
      ).toBe(1);
    },
  );
  it('description validation, stale version and forged actor/time/refund fields leave no writes', async () => {
    const { f } = await overdue();
    for (const patch of [
      { description: 'short' },
      { description: ' '.repeat(30) },
      { description: 'x'.repeat(2001) },
      { description: description + '\u0000' },
      { description: null },
      { expectedVersion: 3 },
      { actorId: operator.id },
      { openedBy: 'DeadlineWorker' },
      { refund: true },
      { submittedAt: new Date().toISOString() },
    ])
      await post(
        `/orders/${f.id}/non-receipt`,
        { expectedVersion: 4, description, ...patch },
        f.f.buyer,
      ).expect(422);
    await report(f, 5).expect(409);
    expect(
      await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
    ).toBe(0);
  });
  it('unpaid, unaccepted, label-only and late-unapplied pickups are ineligible', async () => {
    const fixtures = [await ready(), await paid(), (await labelled()).f];
    for (const f of fixtures) {
      await report(f).expect(409);
      await expect(
        app.get(OrdersService).expireDelivery(f.id),
      ).rejects.toThrow();
    }
    const { f, event } = await labelled(),
      p = (await db.c.order_preparations.findOne({ _id: f.id }))!;
    await freeze(f, p.pickupDeadline);
    await emit(event).expect(200);
    await report(f).expect(409);
    await expect(app.get(OrdersService).expireDelivery(f.id)).rejects.toThrow();
  });
  it('same-key normalized replay survives restart and changed payload conflicts', async () => {
    const { f, p } = await overdue(),
      key = randomUUID();
    const first = await report(
      f,
      4,
      f.f.buyer,
      key,
      '  ' + description + '  ',
    ).expect(200);
    await app.close();
    app = await makeApp();
    await freeze(f, p.deliveryDeadline!);
    const replay = await report(f, 4, f.f.buyer, key).expect(200);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(
      (
        await report(f, 4, f.f.buyer, key, description + ' Bổ sung.').expect(
          409,
        )
      ).body.code,
    ).toBe('IdempotencyConflict');
    expect(await db.c.mutation_receipts.countDocuments({ key })).toBe(1);
  });
  it('worker restart/replay records exactly one system receipt', async () => {
    const { f, p } = await overdue(),
      first = await app.get(OrdersService).expireDelivery(f.id);
    await app.close();
    app = await makeApp();
    await freeze(f, p.deliveryDeadline!);
    const replay = await app.get(OrdersService).expireDelivery(f.id);
    expect(replay.receipt).toEqual(first.receipt);
    expect(replay.replayed).toBe(true);
    expect(
      await db.c.mutation_receipts.countDocuments({
        operation: 'expireOrderDelivery',
        key: f.id,
      }),
    ).toBe(1);
  });
  it('duplicate and conflicting pickup after overdue review do not resume transit or overwrite delivery review', async () => {
    const { f, event, r } = await overdue();
    await app.get(OrdersService).expireDelivery(f.id);
    const before = await db.c.order_delivery_reviews.findOne({ orderId: f.id });
    expect((await emit(event).expect(200)).body).toEqual(r);
    const dup = await emit({ ...event, eventId: randomUUID() }).expect(200);
    expect(dup.body).toMatchObject({
      outcome: 'Duplicate',
      orderState: 'ResolutionPending',
      orderVersion: 5,
    });
    const conflict = await emit({
      ...event,
      eventId: randomUUID(),
      occurredAt: new Date(Date.parse(event.occurredAt) + 1).toISOString(),
    }).expect(200);
    expect(conflict.body).toMatchObject({
      outcome: 'ReviewRequired',
      orderState: 'ResolutionPending',
      orderVersion: 5,
    });
    expect(
      await db.c.order_delivery_reviews.findOne({ orderId: f.id }),
    ).toEqual(before);
    await report(f, 5).expect(200);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('an existing conflicting-pickup review is retained alongside later overdue evidence', async () => {
    const { f, event, p } = await transit();
    await emit({
      ...event,
      eventId: randomUUID(),
      occurredAt: (await fixtureNow()).toISOString(),
    }).expect(200);
    const review = await db.c.carrier_pickup_reviews.findOne({ orderId: f.id });
    await freeze(f, p.deliveryDeadline!);
    await app.get(OrdersService).expireDelivery(f.id);
    await report(f, 5).expect(200);
    expect(
      await db.c.carrier_pickup_reviews.findOne({ orderId: f.id }),
    ).toEqual(review);
    expect((await orderView(f.id, f.f.buyer)).version).toBe(5);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('20 same-key reports commit one report/receipt while different keys cannot duplicate it', async () => {
    const { f } = await overdue(),
      key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        report(f, 4, f.f.buyer, key).then((r) =>
          settled(r, () => report(f, 4, f.f.buyer, key)),
        ),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(
      results.filter((r) => r.headers['idempotency-replayed'] === 'false'),
    ).toHaveLength(1);
    await report(f, 5).expect(409);
    expect(
      await db.c.order_non_receipt_reports.countDocuments({ orderId: f.id }),
    ).toBe(1);
  });
  it('different Buyer keys serialize through a real participant barrier with one winner', async () => {
    const { f } = await overdue(),
      gate = await Gate.lockUser(db.client, f.f.buyer.id),
      keys = [randomUUID(), randomUUID()];
    const calls = keys.map((key) =>
      report(f, 4, f.f.buyer, key).then((r) =>
        settled(r, () => report(f, 4, f.f.buyer, key)),
      ),
    );
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    const results = await Promise.all(calls);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
    ).toBe(1);
    expect((await reconcile()).balanced).toBe(true);
  });
  it.each(['worker', 'buyer'] as const)(
    '%s wins deterministically against the other path blocked at the actual ledger row',
    async (first) => {
      const { f } = await overdue(),
        gate = await lockLedger(f),
        pause = pauseAtLedger(),
        retries = watchRetries();
      const worker = () =>
        app
          .get(OrdersService)
          .expireDelivery(f.id)
          .then((r) => ({ status: 200, r }))
          .catch((e) => ({ status: e.getStatus(), r: null }));
      const buyer = () => report(f).then((r) => ({ status: r.status, r }));
      const a = first === 'worker' ? worker() : buyer();
      let b: ReturnType<typeof worker> | ReturnType<typeof buyer> | undefined;
      try {
        // The first path reaches the ledger lock held by the barrier.
        await gate.contended(1);
        await gate.close();
        // It then takes the ledger lock and is held there, with the
        // participant and Order locks, while the other path contends.
        await pause.reached;
        b = first === 'worker' ? buyer() : worker();
        await retries.until(2);
        pause.release();
        expect((await a).status).toBe(200);
        expect((await b).status).toBe(409);
      } finally {
        pause.release();
        retries.stop();
        await gate.close();
        await a;
        await b;
        pause.spy.mockRestore();
      }
      if (first === 'worker') await report(f, 5).expect(200);
      expect(
        await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
      ).toBe(1);
      expect(
        await db.c.order_non_receipt_reports.countDocuments({ orderId: f.id }),
      ).toBe(1);
      expect((await reconcile()).balanced).toBe(true);
    },
  );
  it('two workers dedupe through a real Buyer lock', async () => {
    const { f } = await overdue(),
      gate = await Gate.lockUser(db.client, f.f.buyer.id);
    const a = app.get(OrdersService).expireDelivery(f.id),
      b = app.get(OrdersService).expireDelivery(f.id);
    try {
      await gate.contended(2);
    } finally {
      await gate.close();
    }
    const results = await Promise.all([a, b]);
    expect(results[0].receipt).toEqual(results[1].receipt);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
  });
  it('uses DB time after ledger contention: arrival before deadline can qualify after the wait', async () => {
    const { f, p } = await transit();
    await freeze(f, new Date(p.deliveryDeadline!.getTime() - 1));
    const gate = await lockLedger(f),
      pending = report(f).then((r) => r);
    try {
      await gate.contended(1);
      vi.mocked(app.get(OrderClock).now).mockResolvedValue(p.deliveryDeadline!);
    } finally {
      await gate.close();
    }
    expect((await pending).status).toBe(200);
  });
  it('session expiry after ledger wait rolls back despite earlier successful guards', async () => {
    const { f } = await overdue(),
      session = (await db.c.auth_sessions.findOne({
        _id: f.f.buyer.sessionId,
      }))!;
    const gate = await lockLedger(f),
      pending = report(f).then((r) => r);
    try {
      await gate.contended(1);
      vi.mocked(app.get(OrderClock).now).mockResolvedValue(session.expiresAt);
    } finally {
      await gate.close();
    }
    expect((await pending).status).toBe(401);
    expect(
      await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
    ).toBe(0);
  });
  it('role revocation under a user barrier is rechecked before receipt replay', async () => {
    const { f } = await overdue(),
      key = randomUUID();
    await report(f, 4, f.f.buyer, key).expect(200);
    const gate = await Gate.lockUser(db.client, f.f.buyer.id),
      pending = report(f, 4, f.f.buyer, key).then((r) => r);
    try {
      await gate.contended(1);
      await gate.db
        .collection<{ _id: string }>('users')
        .updateOne(
          { _id: f.f.buyer.id },
          { $pull: { roles: { role: 'MEMBER' } } } as never,
          { session: gate.session },
        );
      await gate.commit();
    } finally {
      await gate.close();
    }
    expect((await pending).status).toBe(403);
  });
  it.each(['receipt', 'audit', 'outbox'] as const)(
    'Buyer %s failure rolls back review/report/state and allows same-key retry',
    async (stage) => {
      const { f } = await overdue(),
        key = randomUUID();
      // Temporary validator rule (like the former failing SQL trigger).
      const [collection, rejectWhen] =
        stage === 'receipt'
          ? ['mutation_receipts', { operation: 'reportOrderNonReceipt' }]
          : stage === 'audit'
            ? ['audit_events', { action: 'reportOrderNonReceipt' }]
            : ['outbox_events', { type: 'OrderNonReceiptReported' }];
      await db.withRejectingValidator(collection, rejectWhen, () =>
        report(f, 4, f.f.buyer, key).expect(500),
      );
      expect(
        await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
      ).toBe(0);
      expect(
        await db.c.order_non_receipt_reports.countDocuments({ orderId: f.id }),
      ).toBe(0);
      expect(await db.c.direct_orders.findOne({ _id: f.id })).toMatchObject({
        state: 'InTransit',
        version: 4,
      });
      await report(f, 4, f.f.buyer, key).expect(200);
    },
  );
  it('worker outbox failure preserves InTransit and retries safely', async () => {
    const { f } = await overdue();
    await db.withRejectingValidator(
      'outbox_events',
      { type: 'OrderDeliveryReviewOpened' },
      () =>
        expect(app.get(OrdersService).expireDelivery(f.id)).rejects.toThrow(),
    );
    expect(
      await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
    ).toBe(0);
    expect(await db.c.direct_orders.findOne({ _id: f.id })).toMatchObject({
      state: 'InTransit',
      version: 4,
    });
    await app.get(OrdersService).expireDelivery(f.id);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('worker skips ineligible Orders and surfaces open review counts/age without repeatedly mutating them', async () => {
    const x = await transit(),
      future = await transit(),
      p = x.p;
    await freeze(x.f, p.deliveryDeadline!);
    const result = await app.get(OrderExpiryWorker).tick();
    expect(result.failed).toBe(0);
    expect(result.deliveryRemaining).toBe(0);
    expect(result.openDeliveryReviews).toBeGreaterThan(0);
    expect(
      await db.c.order_delivery_reviews.countDocuments({ orderId: x.f.id }),
    ).toBe(1);
    expect(
      await db.c.order_delivery_reviews.countDocuments({
        orderId: future.f.id,
      }),
    ).toBe(0);
    const count = await db.c.mutation_receipts.countDocuments({
      operation: 'expireOrderDelivery',
    });
    await app.get(OrderExpiryWorker).tick();
    expect(
      await db.c.mutation_receipts.countDocuments({
        operation: 'expireOrderDelivery',
      }),
    ).toBe(count);
  });
  it('worker failed review remains in backlog and recovers in the next sweep', async () => {
    const { f } = await overdue();
    await db.withRejectingValidator(
      'order_delivery_reviews',
      { orderId: f.id },
      async () => {
        const result = await app.get(OrderExpiryWorker).tick();
        expect(result.failed).toBe(1);
        expect(result.deliveryRemaining).toBe(1);
        expect(
          await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
        ).toBe(0);
      },
    );
    const recovered = await app.get(OrderExpiryWorker).tick();
    expect(recovered.failed).toBe(0);
    expect(recovered.deliveryRemaining).toBe(0);
    expect(
      await db.c.order_delivery_reviews.countDocuments({ orderId: f.id }),
    ).toBe(1);
  });
  it('report description stays private to participants, while generic operations roles gain no read access', async () => {
    const { f } = await overdue();
    await report(f).expect(200);
    for (const actor of [m1, a1])
      await get(`/me/orders/${f.id}`, actor).expect(404);
    for (const actor of [staff, a2, operator])
      await get(`/me/orders/${f.id}`, actor).expect(403);
    const response = await get(`/me/orders/${f.id}`, f.f.seller).expect(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.deliveryReview.buyerReport.description).toBe(
      description,
    );
  });
  it('worker works without a live participant session or eligible account', async () => {
    const { f } = await overdue();
    await setUser([f.f.buyer.id, f.f.seller.id], { status: 'DISABLED' });
    await db.c.auth_sessions.updateMany(
      { userId: { $in: [f.f.buyer.id, f.f.seller.id] } },
      { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
    await app.get(OrdersService).expireDelivery(f.id);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('database rejects forged review, cross-Order pickup and missing receipts; retained records are immutable', async () => {
    const one = await transit(),
      two = await transit(),
      mongo = app.get(MongoService);
    await freeze(one.f, one.p.deliveryDeadline!);
    // A raw write through the application's own connection must pass the
    // commit-time order checks (C) every command registers, the equivalent
    // of the deferred PostgreSQL constraint triggers and foreign keys.
    for (const pickupEventId of [one.event.eventId, two.event.eventId])
      await expect(
        mongo.tx(async (tx: Tx) => {
          await tx.c.order_delivery_reviews.insertOne({
            _id: randomUUID(),
            orderId: one.f.id,
            pickupEventId,
            openedAt: one.p.deliveryDeadline!,
            openedBy: 'DeadlineWorker',
            policyCode: 'ORDER-DELIVERY-REVIEW-v1',
            receiptId: two.r.id,
          });
          tx.check(`order:${one.f.id}`, () => checkOrder(tx, one.f.id));
        }),
      ).rejects.toThrow();
    expect(
      await db.c.order_delivery_reviews.countDocuments({ orderId: one.f.id }),
    ).toBe(0);
    await report(one.f).expect(200);
    // Reviews and reports are append-only for the application user (P).
    for (const name of [
      'order_delivery_reviews',
      'order_non_receipt_reports',
    ] as const)
      await expect(
        mongo.c[name].deleteMany({ orderId: one.f.id }),
      ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.order_non_receipt_reports.updateOne(
        { orderId: one.f.id },
        { $set: { description: 'Tampered private report text' } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.order_delivery_reviews.updateOne(
        { orderId: one.f.id },
        { $set: { openedBy: 'DeadlineWorker' } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(app.get(OrdersService).refund(one.f.id)).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
});
