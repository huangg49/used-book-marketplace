import { prepareSellerOrder } from './helpers/seller-order.js';
import sharp from 'sharp';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { canonicalJson } from '../src/common/canonical-json.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import type { Tx } from '../src/database/mongo/transaction.js';
import {
  applyCollectionSpecs,
  currentCollections,
} from '../src/database/mongo/migrations/index.js';
import { digest, MediaStorage } from '../src/modules/media/media-storage.js';
import { OrderClock } from '../src/modules/orders/order-clock.js';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { checkShipment } from '../src/modules/orders/order-invariants.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { removeShipmentFixtures } from './helpers/ship-fixtures.js';

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
// Collections PostgreSQL migration 20260928050000 added (0.18.0).
const SHIPMENT_COLLECTIONS = [
  'direct_shipments',
  'shipment_packaging_evidence',
];
// Lock counters are written by every reader/writer that takes the aggregate
// lock (lock-by-write, ADR 0027); they are not business state.
const unlocked = <T extends { lockSeq?: number }>(doc: T | null) => {
  const { lockSeq: _, ...rest } = doc!;
  return rest;
};

describe('Direct shipment registration: real MongoDB and HTTP', () => {
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
  const setUser = (id: string, set: Record<string, unknown>) =>
    db.c.users.updateOne(
      { _id: id },
      { $set: { ...set, updatedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
  const setSession = (id: string, set: Record<string, unknown>) =>
    db.c.auth_sessions.updateOne(
      { _id: id },
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
    // One listening socket per app lifetime: supertest otherwise listens and
    // closes per request, which can reset connections of retried requests.
    await next.listen(0, '127.0.0.1');
    return next;
  }
  // Under contention a command aborts and retries instead of queueing on a
  // row lock; after its retry budget it answers 503. The client then retries
  // with the same idempotency key and the stored receipt decides.
  async function settle(
    first: request.Response,
    again: () => PromiseLike<request.Response>,
  ) {
    let r = first;
    for (let i = 0; r.status === 503 && i < 5; i++) r = await again();
    return r;
  }
  // A raw write through the application's own (least-privilege) connection
  // that must pass the commit-time shipment check (C), the replacement of the
  // PostgreSQL shipment insert guards.
  const checked = (fn: (tx: Tx) => Promise<unknown>, shipmentId: string) =>
    app.get(MongoService).tx(async (tx) => {
      await fn(tx);
      tx.check(`shipment:${shipmentId}`, () => checkShipment(tx, shipmentId));
    });
  // Pre-creates the tracking-uniqueness lock document (the former advisory
  // lock key) so a gate transaction can hold it.
  async function trackingLock(code: string) {
    const id = createHash('sha256')
      .update(canonicalJson(['tracking', 'LatLaiSimulator', code]))
      .digest('hex');
    await db.c.command_locks.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          lockSeq: 0,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      },
      { upsert: true },
    );
    return Gate.lock(db.client, 'command_locks', [id]);
  }
  async function holdAccountLock(f: PaymentFixture) {
    const hold = (await db.c.wallet_accounts.findOne({ orderId: f.id }))!;
    return Gate.lock(db.client, 'account_locks', [hold._id]);
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
    // Populated storage with a real active reservation, posted topup and Ready
    // evidence, built through the pre-existing APIs.
    legacy = await ready();
    await pay(legacy).expect(200);
    await accept(legacy).expect(200);
    legacyEvidence = await reserved(legacy);
    await upload(legacy, legacyEvidence.id, legacyEvidence.bytes).expect(200);
    const snapshot = async () => {
      const rows: Record<string, unknown> = {};
      for (const name of [
        'order_packaging_evidence',
        'order_preparations',
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
          .find({}, { sort: { _id: 1 } })
          .toArray();
      return rows;
    };
    upgradeBefore = await snapshot();
    // MongoDB has no incremental upgrade: the shipment collections are in the
    // baseline schema (0001). Re-apply their validators/indexes, as the
    // migrator, to the populated database.
    await applyCollectionSpecs(
      db.client.db(),
      currentCollections().filter((s) => SHIPMENT_COLLECTIONS.includes(s.name)),
    );
    upgradeAfter = await snapshot();
  }, 60000);
  afterAll(async () => {
    if (db) {
      await removeShipmentFixtures(db, users);
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
      ...await prepareSellerOrder(app, f.buyer, {
        quoteId: q.entityId,
        expectedQuoteVersion: 1,
        expectedListingVersion: f.l.version,
        expectedListingRevisionId: f.l.revisionId,
      }),
    };
  }
  const create = (
    p: Awaited<ReturnType<typeof prepared>>,
    key = randomUUID(),
    actor = p.f.seller,
    body: object = p.body,
  ) => post('/orders', body, actor, key);
  async function orderView(id: string, actor: Reader) {
    const r = await get(`/me/orders/${id}`, actor).expect(200);
    validates('PrivateUnpaidOrder', r.body);
    expect(r.headers['cache-control']).toContain('no-store');
    return r.body;
  }
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
        occurredAt: new Date().toISOString(),
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
  const wallet = async (actor: Reader) => {
    const r = await get('/me/wallet', actor).expect(200);
    validates('WalletSummary', r.body);
    return r.body;
  };
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
  const listing = (f: PaymentFixture, actor = f.f.buyer) =>
    get(`/me/orders/${f.id}/packaging-evidence`, actor);
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
    for (const id of [f.f.seller.sessionId, f.f.buyer.sessionId])
      await setSession(id, { expiresAt: new Date(now.getTime() + 86400000) });
  }
  const preparation = async (f: PaymentFixture) =>
    (await db.c.order_preparations.findOne({ _id: f.id }))!;
  const shipments = (filter: Record<string, unknown>) =>
    db.c.direct_shipments.countDocuments(filter);
  it('re-applying the shipment schema to populated storage preserves accepted Order, Ready evidence, receipts and money', async () => {
    expect(upgradeAfter).toEqual(upgradeBefore);
    const r = await register(legacy, shipBody([legacyEvidence.id])).expect(200);
    validates('ShipmentCommandReceipt', r.body);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('registers one immutable outbound with frozen contacts, selected images and fee without changing Order, hold or commitment', async () => {
    const { f, e, body } = await dispatchable();
    const before = await db.c.direct_orders.findOne({ _id: f.id }),
      money = await wallet(f.f.buyer),
      l = await db.c.listings.findOne({ _id: f.f.l.entityId });
    expect(
      (await orderView(f.id, f.f.seller)).shipmentRegistrationEnabled,
    ).toBe(true);
    expect((await orderView(f.id, f.f.buyer)).shipmentRegistrationEnabled).toBe(
      false,
    );
    const r = await register(f, body).expect(200);
    validates('ShipmentCommandReceipt', r.body);
    expect(r.body).toMatchObject({
      entityType: 'Shipment',
      orderId: f.id,
      contextId: f.r.contextId,
      state: 'LabelCreated',
      version: 1,
    });
    expect(JSON.stringify(r.body)).not.toMatch(
      /trackingCode|phone|recipientName|shippingFee/,
    );
    const seller = (await shipment(f, f.f.seller).expect(200)).body,
      buyer = (await shipment(f).expect(200)).body;
    validates('PrivateDirectShipment', seller);
    validates('PrivateDirectShipment', buyer);
    const a = (await db.c.agreement_snapshots.findOne({
        _id: f.r.contextId,
      }))!,
      ag = a.snapshot as any;
    expect(seller.origin).toEqual(ag.origin);
    expect(seller.destination).toEqual(ag.destination);
    expect(buyer.origin).toBeNull();
    expect(buyer.destination).toEqual(ag.destination);
    expect(seller).toMatchObject({
      carrier: 'LatLaiSimulator',
      trackingCode: body.trackingCode,
      direction: 'Outbound',
      demoOnly: true,
      pickupConfirmed: false,
      shippingFee: ag.amounts.shippingFee,
      packagingEvidenceIds: [e.id],
    });
    expect(unlocked(await db.c.direct_orders.findOne({ _id: f.id }))).toEqual(
      unlocked(before),
    );
    expect(unlocked(await db.c.listings.findOne({ _id: l!._id }))).toEqual(
      unlocked(l),
    );
    expect((await wallet(f.f.buyer)).transactionHeld).toBe(
      money.transactionHeld,
    );
    expect(money.transactionHeld).toBeGreaterThan(0);
    expect(
      (await orderView(f.id, f.f.seller)).shipmentRegistrationEnabled,
    ).toBe(false);
    expect((await reconcile()).balanced).toBe(true);
    const audits = (
      await db.c.audit_events.find({ contextId: f.r.contextId }).toArray()
    ).map((x) => x._id);
    expect(
      await db.c.outbox_events.countDocuments({
        type: 'DirectShipmentRegistered',
        auditId: { $in: audits },
      }),
    ).toBe(1);
  });
  it('only advertises registration after a Ready packaging upload and before its original pickup deadline', async () => {
    const f = await accepted();
    expect(
      (await orderView(f.id, f.f.seller)).shipmentRegistrationEnabled,
    ).toBe(false);
    const e = await reserved(f);
    expect(
      (await orderView(f.id, f.f.seller)).shipmentRegistrationEnabled,
    ).toBe(false);
    await upload(f, e.id, e.bytes).expect(200);
    expect(
      (await orderView(f.id, f.f.seller)).shipmentRegistrationEnabled,
    ).toBe(true);
    const p = await preparation(f);
    await extendSession(f, p.pickupDeadline);
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    expect(
      (await orderView(f.id, f.f.seller)).shipmentRegistrationEnabled,
    ).toBe(false);
  });
  it('denies guest, buyer registration, outsiders and generic operations roles', async () => {
    const { f, body } = await dispatchable();
    await get(`/me/orders/${f.id}/shipment`).expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${f.id}/shipment`)
      .send(body)
      .expect(401);
    for (const actor of [f.f.buyer, m1, a1])
      await register(f, body, actor).expect(404);
    for (const actor of [staff, a2, operator]) {
      await register(f, body, actor).expect(403);
      await shipment(f, actor).expect(403);
    }
    await shipment(f).expect(404);
    await register(f, body).expect(200);
    await shipment(f, m1).expect(404);
    await shipment(f, a1).expect(404);
  });
  it.each(['LOCKED', 'RESTRICTED'] as const)(
    'allows %s participants to fulfill this existing obligation',
    async (status) => {
      const { f, body } = await dispatchable();
      for (const id of [f.f.seller.id, f.f.buyer.id])
        await db.setStatus(id, status);
      expect(
        (await orderView(f.id, f.f.seller)).shipmentRegistrationEnabled,
      ).toBe(true);
      await register(f, body).expect(200);
      await shipment(f).expect(200);
      await shipment(f, f.f.seller).expect(200);
    },
  );
  it('buyer losing access does not erase seller obligation', async () => {
    const { f, body } = await dispatchable();
    await db.setStatus(f.f.buyer.id, 'DISABLED');
    await register(f, body).expect(200);
    await shipment(f).expect(401);
    await shipment(f, f.f.seller).expect(200);
  });
  it('rejects invalid tracking, duplicate image IDs, arbitrary carriers, fee/contact/direction overrides', async () => {
    const { f, e, body } = await dispatchable();
    for (const extra of [
      { trackingCode: 'll-12345678' },
      { trackingCode: 'LL-123' },
      { trackingCode: 'LL-1234 5678' },
      { trackingCode: 'LL-' + 'A'.repeat(33) },
      { carrier: 'RealCarrier' },
      { packagingEvidenceIds: [] },
      { packagingEvidenceIds: [e.id, e.id] },
      { packagingEvidenceIds: [e.id, e.id.toUpperCase()] },
      { packagingEvidenceIds: Array.from({ length: 9 }, () => randomUUID()) },
      { origin: {} },
      { destination: {} },
      { shippingFee: 1 },
      { direction: 'Return' },
      { state: 'PickedUp' },
    ])
      await register(f, { ...body, ...extra }).expect(422);
    expect(await shipments({ orderId: f.id })).toBe(0);
  });
  it('normalizes outer whitespace and UUID case before uniqueness and receipt hashing', async () => {
    const { f, e, body } = await dispatchable(),
      key = randomUUID();
    const first = await register(
      f,
      {
        ...body,
        trackingCode: ' ' + body.trackingCode + ' ',
        packagingEvidenceIds: [e.id.toUpperCase()],
      },
      f.f.seller,
      key,
    ).expect(200);
    expect((await register(f, body, f.f.seller, key).expect(200)).body).toEqual(
      first.body,
    );
    expect((await shipment(f)).body.trackingCode).toBe(body.trackingCode);
  });
  it('rejects stale expected version, unpaid/unaccepted/cancelled Orders', async () => {
    const { f, body } = await dispatchable();
    await register(f, { ...body, expectedOrderVersion: 2 }).expect(409);
    const un = await ready();
    await register(un, { ...body, expectedOrderVersion: 1 }).expect(409);
    await post(
      `/orders/${un.id}/cancel`,
      { expectedVersion: 1 },
      un.f.buyer,
    ).expect(200);
    await register(un, { ...body, expectedOrderVersion: 2 }).expect(409);
    const paidOrder = await paid();
    await register(paidOrder, { ...body, expectedOrderVersion: 2 }).expect(409);
  });
  it('rejects Pending, unknown, listing media and another Orders Ready images without creating records', async () => {
    const { f, body } = await dispatchable(),
      pending = await reserved(f),
      other = await dispatchable();
    for (const id of [pending.id, randomUUID(), f.f.l.image.id, other.e.id])
      await register(f, { ...body, packagingEvidenceIds: [id] }).expect(422);
    expect(await shipments({ orderId: f.id })).toBe(0);
    await register(f, body).expect(200);
  });
  it('pins ordered evidence membership; later uploads do not alter the registered photos', async () => {
    const { f, e, body } = await dispatchable(),
      second = await reserved(f);
    await upload(f, second.id, second.bytes).expect(200);
    const ids = [second.id, e.id];
    await register(f, { ...body, packagingEvidenceIds: ids }).expect(200);
    const third = await reserved(f);
    await upload(f, third.id, third.bytes).expect(200);
    expect((await shipment(f)).body.packagingEvidenceIds).toEqual(ids);
  });
  it('later address edits cannot rewrite the registered sender or recipient snapshots', async () => {
    const { f, body } = await dispatchable();
    await register(f, body).expect(200);
    const before = (await shipment(f, f.f.seller)).body;
    for (const [actor, entry] of [
      [f.f.seller, f.f.origin],
      [f.f.buyer, f.f.destination],
    ] as const) {
      const book = (await get('/me/addresses', actor).expect(200)).body;
      await request(app.getHttpServer())
        .put(`/api/v1/me/addresses/${entry.id}`)
        .set('Authorization', `Bearer ${actor.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedBookVersion: book.version,
          makeDefault: false,
          address: { ...addressInput, detail: 'Changed after agreement' },
        })
        .expect(200);
    }
    expect((await shipment(f, f.f.seller)).body).toEqual(before);
  });
  it('one Order cannot register another label even with a different key/code', async () => {
    const { f, body } = await dispatchable();
    await register(f, body).expect(200);
    await register(f, body).expect(409);
    await register(f, { ...body, trackingCode: tracking() }).expect(409);
    expect(await shipments({ orderId: f.id })).toBe(1);
  });
  it('carrier/tracking is globally unique and conflict does not expose another Orders identity', async () => {
    const a = await dispatchable(),
      b = await dispatchable();
    await register(a.f, a.body).expect(200);
    const r = await register(b.f, {
      ...b.body,
      trackingCode: a.body.trackingCode,
    }).expect(409);
    expect(JSON.stringify(r.body)).not.toContain(a.f.id);
    expect(await shipments({ orderId: b.f.id })).toBe(0);
  });
  it('replays original receipt after deadline/review/restart but rejects changed key payload', async () => {
    const { f, body } = await dispatchable(),
      key = randomUUID(),
      r = await register(f, body, f.f.seller, key).expect(200);
    await register(
      f,
      { ...body, trackingCode: tracking() },
      f.f.seller,
      key,
    ).expect(409);
    const p = await preparation(f);
    await extendSession(f, p.pickupDeadline);
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    await app.get(OrdersService).expirePickup(f.id);
    const replay = await register(f, body, f.f.seller, key).expect(200);
    expect(replay.body).toEqual(r.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await app.close();
    app = await makeApp();
    expect((await register(f, body, f.f.seller, key)).body).toEqual(r.body);
    expect((await shipment(f)).body.pickupConfirmed).toBe(false);
    expect((await orderView(f.id, f.f.buyer)).state).toBe('ResolutionPending');
  });
  it('registration at the exact pickup deadline loses even when the expiry worker has not run', async () => {
    const { f, body } = await dispatchable(),
      p = await preparation(f);
    await extendSession(f, p.pickupDeadline);
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    await register(f, body).expect(409);
    expect((await db.c.direct_orders.findOne({ _id: f.id }))!.state).toBe(
      'Preparing',
    );
    expect(await shipments({ orderId: f.id })).toBe(0);
  });
  it('registers just before deadline but does not prevent the later pickup review', async () => {
    const { f, body } = await dispatchable(),
      p = await preparation(f);
    await extendSession(f, p.pickupDeadline);
    const clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(p.pickupDeadline.getTime() - 1));
    await register(f, body).expect(200);
    clock.mockResolvedValue(p.pickupDeadline);
    await app.get(OrdersService).expirePickup(f.id);
    expect((await shipment(f)).body.state).toBe('LabelCreated');
    expect((await orderView(f.id, f.f.buyer)).state).toBe('ResolutionPending');
    await expect(app.get(OrdersService).refund(f.id)).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
  it('expiry winning first rejects registration while keeping photos and money', async () => {
    const { f, body } = await dispatchable(),
      p = await preparation(f);
    await extendSession(f, p.pickupDeadline);
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    await app.get(OrdersService).expirePickup(f.id);
    await register(f, { ...body, expectedOrderVersion: 4 }).expect(409);
    expect((await listing(f)).body.items[0].status).toBe('Ready');
    expect((await reconcile()).balanced).toBe(true);
  });
  it('20 simultaneous same-key registrations commit one receipt, label and evidence set', async () => {
    const { f, body } = await dispatchable(),
      key = randomUUID();
    const send = () => register(f, body, f.f.seller, key).then((r) => r);
    const first = await Promise.all(Array.from({ length: 20 }, send));
    console.info(
      'Same-key shipment race',
      Object.fromEntries(
        [200, 503].map((s) => [s, first.filter((r) => r.status === s).length]),
      ),
    );
    const results = [];
    for (const r of first) results.push(await settle(r, send));
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(200));
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await shipments({ orderId: f.id })).toBe(1);
    expect(
      await db.c.shipment_packaging_evidence.countDocuments({ orderId: f.id }),
    ).toBe(1);
  });
  it('different keys racing for one Order have one winner under a participant DB barrier', async () => {
    const { f, body } = await dispatchable(),
      gate = await Gate.lockUser(db.client, f.f.seller.id);
    const bodies = [body, { ...body, trackingCode: tracking() }],
      keys = [randomUUID(), randomUUID()];
    const contenders = bodies.map((b, i) =>
      register(f, b, f.f.seller, keys[i]).then((r) => r),
    );
    try {
      await gate.contended(2);
      await gate.commit();
      const results = await Promise.all(contenders);
      for (let i = 0; i < 2; i++)
        results[i] = await settle(results[i], () =>
          register(f, bodies[i], f.f.seller, keys[i]),
        );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await shipments({ orderId: f.id })).toBe(1);
    } finally {
      await gate.close();
      await Promise.allSettled(contenders);
    }
  });
  it('independent Orders racing for one tracking code have one winner under its tracking lock barrier', async () => {
    const a = await dispatchable(),
      b = await dispatchable(),
      code = tracking(),
      gate = await trackingLock(code);
    const sides = [a, b].map((x) => ({
      x,
      body: { ...x.body, trackingCode: code },
      key: randomUUID(),
    }));
    const contenders = sides.map((s) =>
      register(s.x.f, s.body, s.x.f.f.seller, s.key).then((r) => r),
    );
    try {
      await gate.contended(2);
      await gate.commit();
      const results = await Promise.all(contenders);
      for (let i = 0; i < 2; i++)
        results[i] = await settle(results[i], () =>
          register(
            sides[i].x.f,
            sides[i].body,
            sides[i].x.f.f.seller,
            sides[i].key,
          ),
        );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await shipments({ trackingCode: code })).toBe(1);
    } finally {
      await gate.close();
      await Promise.allSettled(contenders);
    }
  });
  it('rechecks deadline after waiting for the actual hold account lock', async () => {
    const { f, body } = await dispatchable(),
      p = await preparation(f);
    await extendSession(f, p.pickupDeadline);
    const gate = await holdAccountLock(f),
      contender = register(f, body).then((r) => r);
    try {
      await gate.contended();
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
      await gate.commit();
      expect((await contender).status).toBe(409);
      expect(await shipments({ orderId: f.id })).toBe(0);
    } finally {
      await gate.close();
      await contender;
    }
  });
  it('rechecks session expiration after waiting for tracking uniqueness', async () => {
    const { f, body } = await dispatchable(),
      gate = await trackingLock(body.trackingCode),
      contender = register(f, body).then((r) => r);
    try {
      await gate.contended();
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(
        new Date(Date.now() + 2 * 86400000),
      );
      await gate.commit();
      expect((await contender).status).toBe(401);
      expect(await shipments({ orderId: f.id })).toBe(0);
    } finally {
      await gate.close();
      await contender;
    }
  });
  it('rechecks revoked role before replay while blocked on user row', async () => {
    const { f, body } = await dispatchable(),
      key = randomUUID();
    await register(f, body, f.f.seller, key).expect(200);
    const gate = await Gate.lockUser(db.client, f.f.seller.id),
      contender = register(f, body, f.f.seller, key).then((r) => r);
    try {
      await gate.contended();
      await gate.db
        .collection<{ _id: string }>('users')
        .updateOne(
          { _id: f.f.seller.id },
          { $set: { roles: [], updatedAt: new Date() } },
          { session: gate.session },
        );
      await gate.commit();
      expect((await contender).status).toBe(403);
    } finally {
      await gate.close();
      await contender;
    }
  });
  it.each(['DISABLED', 'UNVERIFIED', 'REVOKED'] as const)(
    'denies %s seller receipt replay',
    async (mode) => {
      const { f, body } = await dispatchable(),
        key = randomUUID();
      await register(f, body, f.f.seller, key).expect(200);
      if (mode === 'DISABLED') await db.setStatus(f.f.seller.id, 'DISABLED');
      else if (mode === 'UNVERIFIED')
        await setUser(f.f.seller.id, { emailVerifiedAt: null });
      else await setSession(f.f.seller.sessionId, { revokedAt: new Date() });
      await register(f, body, f.f.seller, key).expect(401);
      await shipment(f, f.f.seller).expect(401);
    },
  );
  it.each(['audit', 'outbox'] as const)(
    'rolls back registration/photos/receipt on %s failure and allows same-key retry',
    async (stage) => {
      const { f, body } = await dispatchable(),
        key = randomUUID();
      // Temporary validator rule (the former failing BEFORE INSERT trigger).
      await db.withRejectingValidator(
        stage === 'audit' ? 'audit_events' : 'outbox_events',
        stage === 'audit'
          ? { action: 'registerDirectShipment' }
          : { type: 'DirectShipmentRegistered' },
        () => register(f, body, f.f.seller, key).expect(500),
      );
      expect(await shipments({ orderId: f.id })).toBe(0);
      expect(
        await db.c.shipment_packaging_evidence.countDocuments({
          orderId: f.id,
        }),
      ).toBe(0);
      expect(
        await db.c.mutation_receipts.countDocuments({
          contextId: f.r.contextId,
          operation: 'registerDirectShipment',
        }),
      ).toBe(0);
      await register(f, body, f.f.seller, key).expect(200);
      expect((await reconcile()).balanced).toBe(true);
    },
  );
  it('DB blocks edits/deletion, post-registration photo changes, cross-Order references and forged registration', async () => {
    const { f, e, body } = await dispatchable(),
      r = (await register(f, body).expect(200)).body,
      more = await reserved(f);
    await upload(f, more.id, more.bytes).expect(200);
    const appDb = app.get(MongoService).c;
    // Shipments and their evidence links are append-only for the app user (P).
    await expect(
      appDb.direct_shipments.deleteOne({ _id: r.entityId }),
    ).rejects.toMatchObject({ code: 13 });
    for (const set of [{ trackingCode: 'LL-12345678' }, { state: 'PickedUp' }])
      await expect(
        appDb.direct_shipments.updateOne(
          { _id: r.entityId },
          { $set: set as never },
        ),
      ).rejects.toMatchObject({ code: 13 });
    await expect(
      appDb.shipment_packaging_evidence.deleteMany({ shipmentId: r.entityId }),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      appDb.shipment_packaging_evidence.updateMany(
        { shipmentId: r.entityId },
        { $set: { position: 1 } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    // Inserts are rejected by the commit-time shipment check (C, formerly
    // shipment_evidence_insert_guard / shipment_insert_guard).
    const link = (orderId: string, evidenceId: string) => ({
      _id: `${r.entityId}:${evidenceId}`,
      shipmentId: r.entityId,
      orderId,
      evidenceId,
      position: 1,
    });
    await expect(
      checked(
        (tx) => tx.c.shipment_packaging_evidence.insertOne(link(f.id, more.id)),
        r.entityId,
      ),
    ).rejects.toThrow('Shipment requires pinned Ready packaging images');
    const other = await dispatchable();
    await expect(
      checked(
        (tx) =>
          tx.c.shipment_packaging_evidence.insertOne(
            link(other.f.id, other.e.id),
          ),
        r.entityId,
      ),
    ).rejects.toThrow('Shipment requires pinned Ready packaging images');
    const source = (await db.c.direct_shipments.findOne({ _id: r.entityId }))!,
      forged = randomUUID();
    await expect(
      checked(
        (tx) =>
          tx.c.direct_shipments.insertOne({
            ...source,
            _id: forged,
            orderId: other.f.id,
            trackingCode: tracking(),
            registeredAt: new Date(),
            receiptId: randomUUID(),
          }),
        forged,
      ),
    ).rejects.toThrow('Shipment frozen agreement/deadline mismatch');
    expect(await shipments({ orderId: other.f.id })).toBe(0);
    expect(
      await db.c.shipment_packaging_evidence.countDocuments({
        shipmentId: r.entityId,
      }),
    ).toBe(1);
    expect((await shipment(f)).body.packagingEvidenceIds).toEqual([e.id]);
    expect((await reconcile()).balanced).toBe(true);
  });
});
