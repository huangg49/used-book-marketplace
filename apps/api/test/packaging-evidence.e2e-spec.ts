import { prepareSellerOrder } from './helpers/seller-order.js';
import sharp from 'sharp';
import { digest } from '../src/modules/media/media-storage.js';
import { ImageUploadSlots } from '../src/modules/media/image-upload-slots.js';
import { MediaWorker } from '../src/modules/media/media-worker.service.js';
import { OrderClock } from '../src/modules/orders/order-clock.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';

import { OrdersService } from '../src/modules/orders/orders.service.js';
import { checkPackaging } from '../src/modules/orders/order-invariants.js';

import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import request from 'supertest';
import type {
  OrderPackagingEvidenceDoc,
  RoleCode,
  UserStatus,
} from '../src/database/mongo/documents.js';
import { migrate, pendingMigrations } from '../src/database/mongo/migrate.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import {
  onTransactionRetry,
  type Tx,
} from '../src/database/mongo/transaction.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { removeOrderFixtures } from './helpers/prep-cleanup.js';

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
// Collections the PostgreSQL upgrade test compared before/after migration.
const upgradeCollections = [
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
] as const;
// Global serialization point of the shared storage budget (the former
// pg_advisory_xact_lock(781204991)); see lockStorageBudget.
const BUDGET_LOCK = 'media-storage-budget-lock';

describe('Private packaging evidence: real MongoDB, HTTP and Sharp', () => {
  let app: INestApplication, db: MongoFixtures;
  const users: string[] = [];
  let upgradeBefore: Record<string, unknown>,
    upgradeAfter: Record<string, unknown>,
    upgradeApplied: string[];
  let legacy: PaymentFixture;
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
    // One listening socket per app lifetime (staggered 503 retries in races).
    await next.listen(0, '127.0.0.1');
    return next;
  }
  // Holds the storage budget lock document in an open transaction, like the
  // former barrier connection holding the advisory lock. Contenders then
  // conflict on it and retry (observable) until the gate commits.
  async function budgetGate() {
    const transactions = new Set<number>();
    const stop = onTransactionRetry((event) =>
      transactions.add(event.transactionId),
    );
    const session = db.client.startSession();
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
    await db.client
      .db()
      .collection<{ _id: string; value: number }>('counters')
      .updateOne(
        { _id: BUDGET_LOCK },
        { $inc: { value: 1 } },
        { upsert: true, session },
      );
    const close = async () => {
      stop();
      if (session.inTransaction())
        await session.abortTransaction().catch(() => undefined);
      await session.endSession();
    };
    return {
      async contended(n = 1) {
        const until = Date.now() + 4000;
        while (Date.now() < until) {
          if (transactions.size >= n) return;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new Error('Commands did not reach the lock barrier');
      },
      async commit() {
        try {
          await session.commitTransaction();
        } finally {
          await close();
        }
      },
      close,
    };
  }
  // A raw write through the application's own connection that must pass the
  // commit-time packaging check (C, the former latlai_packaging_consistency).
  const checked = (fn: (tx: Tx) => Promise<unknown>, evidenceId: string) =>
    app.get(MongoService).tx(async (tx) => {
      await fn(tx);
      tx.check(`packaging:${evidenceId}`, () => checkPackaging(tx, evidenceId));
    });
  const snapshot = async () => {
    const rows: Record<string, unknown> = {};
    for (const name of upgradeCollections)
      rows[name] = await db.client
        .db()
        .collection(name)
        .find({}, { sort: { _id: 1 } })
        .toArray();
    return rows;
  };

  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    db = await MongoFixtures.connect();
    app = await makeApp();
    m1 = await reader();
    operator = await reader(['TEST_OPERATOR']);
    a1 = await reader(['MEMBER', 'ADMIN']);
    a2 = await reader(['ADMIN']);
    staff = await reader(['STAFF']);
    // Exercise the schema run with a real accepted Order, hold and posted
    // topup, built through the pre-existing APIs. PostgreSQL applied migration
    // 20260928040000 here; MongoDB's baseline already contains the packaging
    // collection, so re-running the migrations must be a no-op.
    legacy = await ready();
    await pay(legacy).expect(200);
    await accept(legacy).expect(200);
    upgradeBefore = await snapshot();
    upgradeApplied = await migrate(db.client, db.client.db());
    upgradeAfter = await snapshot();
  }, 60000);
  afterAll(async () => {
    storage.afterPut = undefined;
    storage.beforeSign = undefined;
    storage.failCheck = false;
    if (db) {
      await removeOrderFixtures(db, users);
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
  const preview = (f: PaymentFixture, id: string, actor = f.f.buyer) =>
    get(`/me/orders/${f.id}/packaging-evidence/${id}/read`, actor);
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
  const evidence = async (id: string) =>
    (await db.c.order_packaging_evidence.findOne({ _id: id }))!;
  const preparation = async (orderId: string) =>
    (await db.c.order_preparations.findOne({ _id: orderId }))!;
  const readAudits = (contextId: string, action: string) =>
    db.c.audit_events.countDocuments({ contextId, action });
  const budgetTotal = async () => {
    let total = 0;
    for (const name of ['listing_media', 'order_packaging_evidence'] as const) {
      const [row] = await db.c[name]
        .aggregate<{ total: number }>([
          { $group: { _id: null, total: { $sum: '$reservedBytes' } } },
        ])
        .toArray();
      total += row?.total ?? 0;
    }
    return total;
  };
  afterEach(() => {
    storage.afterPut = undefined;
    storage.beforeSign = undefined;
    storage.failCheck = false;
    vi.restoreAllMocks();
    app.get(ConfigService).set('MEDIA_STORAGE_BUDGET_BYTES', 800000000);
  });
  it('re-running migrations does not change accepted Orders, reservations or ledger', async () => {
    // PostgreSQL: applying 20260928040000 over thirteen migrations left these
    // tables unchanged. MongoDB: the packaging model is in the baseline and
    // migrations are checksummed and idempotent, so nothing is pending.
    expect(upgradeApplied).toEqual([]);
    expect(await pendingMigrations(app.get(MongoService).db)).toEqual([]);
    expect(upgradeAfter).toEqual(upgradeBefore);
    const e = await reserved(legacy);
    await upload(legacy, e.id, e.bytes).expect(200);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('uploads a real decoded image, retains exact original, strips metadata and audits both participant previews', async () => {
    const f = await accepted(),
      e = await reserved(f);
    const before = await orderView(f.id, f.f.buyer),
      money = await wallet(f.f.buyer);
    const sent = await upload(f, e.id, e.bytes).expect(200);
    validates('PackagingEvidenceReceipt', sent.body);
    expect(sent.body).toMatchObject({
      entityId: e.id,
      version: 2,
      state: 'Ready',
      orderId: f.id,
    });
    expect(objects.get(`order-evidence/${e.id}/original`)).toEqual(e.bytes);
    const meta = await sharp(
      objects.get(`order-evidence/${e.id}/preview-v1.webp`),
    ).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 40, height: 30 });
    expect(meta.exif).toBeUndefined();
    const list = await listing(f).expect(200);
    validates('PackagingEvidenceList', list.body);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      id: e.id,
      purpose: 'Packaging',
      status: 'Ready',
      sha256: digest(e.bytes),
    });
    expect(JSON.stringify(list.body)).not.toMatch(
      /original|preview-v1|derivative|storage.test/,
    );
    for (const actor of [f.f.buyer, f.f.seller]) {
      const r = await preview(f, e.id, actor).expect(200);
      validates('MediaRead', r.body);
      expect(r.body.url).toContain('preview-v1.webp');
      expect(r.headers['cache-control']).toContain('no-store');
    }
    expect(await readAudits(f.r.contextId, 'readPackagingEvidence')).toBe(2);
    const after = await orderView(f.id, f.f.buyer);
    expect(after.version).toBe(before.version);
    expect(after.state).toBe('Preparing');
    expect(money.transactionHeld).toBeGreaterThan(0);
    expect((await wallet(f.f.buyer)).transactionHeld).toBe(
      money.transactionHeld,
    );
    expect(
      await db.c.exclusive_commitments.countDocuments({
        currentContextId: f.r.contextId,
        status: 'Active',
      }),
    ).toBe(1);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('denies guest, buyer uploads, outsiders and generic Staff/Admin access', async () => {
    const f = await accepted(),
      e = await reserved(f);
    await get(`/me/orders/${f.id}/packaging-evidence`).expect(401);
    for (const actor of [f.f.buyer, m1]) {
      await intent(f, e.bytes, actor).expect(404);
      await upload(f, e.id, e.bytes, actor).expect(404);
    }
    for (const actor of [staff, a2, operator]) {
      await listing(f, actor).expect(403);
      await preview(f, e.id, actor).expect(403);
      await intent(f, e.bytes, actor).expect(403);
    }
    await listing(f, m1).expect(404);
    await preview(f, e.id, a1).expect(404);
  });
  it('blocks pre-acceptance and stale versions, invalid metadata, client object keys and pending previews', async () => {
    const f = await ready(),
      bytes = await image();
    await intent(f, bytes, f.f.seller, randomUUID(), 1).expect(409);
    await pay(f).expect(200);
    await intent(f, bytes, f.f.seller, randomUUID(), 2).expect(409);
    await accept(f).expect(200);
    await intent(f, bytes, f.f.seller, randomUUID(), 2).expect(409);
    const body = {
      expectedVersion: 3,
      mimeType: 'image/png',
      byteSize: bytes.length,
      sha256: digest(bytes),
    };
    for (const extra of [
      { byteSize: 10000001 },
      { mimeType: 'image/svg+xml' },
      { sha256: 'xyz' },
      { objectKey: 'arbitrary' },
    ])
      await post(base(f), { ...body, ...extra }, f.f.seller).expect(422);
    const e = await reserved(f);
    await preview(f, e.id).expect(422);
    await upload(f, randomUUID(), bytes).expect(404);
  });
  it.each(['LOCKED', 'RESTRICTED'] as const)(
    'allows %s seller existing evidence and participant reads without enabling payment',
    async (status) => {
      const f = await accepted();
      for (const id of [f.f.seller.id, f.f.buyer.id])
        await db.setStatus(id, status);
      const e = await reserved(f);
      await upload(f, e.id, e.bytes).expect(200);
      await listing(f).expect(200);
      await preview(f, e.id).expect(200);
      if (status === 'LOCKED')
        await pay(f, randomUUID(), f.f.buyer, 3).expect(403);
    },
  );
  it('preserves server time and hold when upload arrives after overdue pickup review', async () => {
    const f = await accepted(),
      e = await reserved(f);
    const p = await preparation(f.id);
    for (const id of [f.f.seller.sessionId, f.f.buyer.sessionId])
      await setSession(id, {
        expiresAt: new Date(p.pickupDeadline.getTime() + 86400000),
      });
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    await app.get(OrdersService).expirePickup(f.id);
    await upload(f, e.id, e.bytes).expect(200);
    const m = await evidence(e.id);
    expect(m.uploadedAt).toEqual(p.pickupDeadline);
    expect((await orderView(f.id, f.f.buyer)).state).toBe('ResolutionPending');
    await intent(f, await image(), f.f.seller, randomUUID(), 4).expect(200);
    await expect(app.get(OrdersService).refund(f.id)).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
  it('replays create and acknowledged upload without storage availability; rejects payload/key reuse and duplicate hashes', async () => {
    const f = await accepted(),
      bytes = await image(),
      key = randomUUID();
    const first = await intent(f, bytes, f.f.seller, key).expect(200);
    const repeated = await intent(f, bytes, f.f.seller, key).expect(200);
    expect(repeated.body).toEqual(first.body);
    expect(repeated.headers['idempotency-replayed']).toBe('true');
    await intent(f, await image(), f.f.seller, key).expect(409);
    await intent(f, bytes).expect(409);
    const id = first.body.entityId,
      ukey = randomUUID();
    const sent = await upload(f, id, bytes, f.f.seller, ukey).expect(200);
    storage.failCheck = true;
    const replay = await upload(f, id, bytes, f.f.seller, ukey).expect(200);
    expect(replay.body).toEqual(sent.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await upload(f, id, bytes).expect(409);
    expect(await readAudits(f.r.contextId, 'uploadPackagingEvidence')).toBe(1);
  });
  it('does not overwrite an immutable intent with changed bytes, oversized or mismatched MIME', async () => {
    const f = await accepted(),
      e = await reserved(f);
    await upload(f, e.id, Buffer.alloc(e.bytes.length, 1)).expect(422);
    await upload(f, e.id, Buffer.alloc(e.bytes.length + 1)).expect(413);
    await upload(
      f,
      e.id,
      e.bytes,
      f.f.seller,
      randomUUID(),
      'image/jpeg',
    ).expect(415);
    expect(objects.has(`order-evidence/${e.id}/original`)).toBe(false);
    await upload(f, e.id, e.bytes).expect(200);
  });
  it('rejects bogus images even if SHA and byte size match', async () => {
    const f = await accepted(),
      bytes = Buffer.from('this is not an image');
    const e = await intent(f, bytes).expect(200);
    await upload(f, e.body.entityId, bytes).expect(422);
    expect(objects.has(`order-evidence/${e.body.entityId}/original`)).toBe(
      false,
    );
    expect((await listing(f)).body.items[0].status).toBe('Pending');
  });
  it('rejects real JPEG declared PNG before any object is written', async () => {
    const f = await accepted(),
      bytes = await sharp(await image())
        .jpeg()
        .toBuffer();
    const e = await intent(f, bytes).expect(200);
    await upload(f, e.body.entityId, bytes).expect(422);
    expect(objects.has(`order-evidence/${e.body.entityId}/original`)).toBe(
      false,
    );
  });
  it('recovers partial storage success with the same immutable keys and preserved budget', async () => {
    const f = await accepted(),
      e = await reserved(f),
      key = randomUUID();
    const total = await budgetTotal();
    storage.afterPut = async (path) => {
      if (path.endsWith('/original'))
        throw new Error('lost provider acknowledgement');
    };
    await upload(f, e.id, e.bytes, f.f.seller, key).expect(500);
    expect(objects.has(`order-evidence/${e.id}/original`)).toBe(true);
    expect((await listing(f)).body.items[0].status).toBe('Pending');
    expect(await budgetTotal()).toBe(total);
    storage.afterPut = undefined;
    await upload(f, e.id, e.bytes, f.f.seller, key).expect(200);
    expect([...objects.keys()].filter((k) => k.includes(e.id))).toHaveLength(2);
  });
  it('rechecks disabled account after storage; retry recovers without releasing reservation', async () => {
    const f = await accepted(),
      e = await reserved(f),
      key = randomUUID();
    storage.afterPut = async (path) => {
      if (path.endsWith('.webp')) await db.setStatus(f.f.seller.id, 'DISABLED');
    };
    await upload(f, e.id, e.bytes, f.f.seller, key).expect(401);
    expect((await evidence(e.id)).status).toBe('Pending');
    storage.afterPut = undefined;
    await db.setStatus(f.f.seller.id, 'ACTIVE');
    await upload(f, e.id, e.bytes, f.f.seller, key).expect(200);
  });
  it('does not issue a preview or successful read audit when participant access changes during signing', async () => {
    const f = await accepted(),
      e = await reserved(f);
    await upload(f, e.id, e.bytes).expect(200);
    storage.beforeSign = async () => {
      await db.setStatus(f.f.buyer.id, 'DISABLED');
    };
    await preview(f, e.id).expect(401);
    expect(await readAudits(f.r.contextId, 'readPackagingEvidence')).toBe(0);
  });
  it('does not confuse listing media or another Order evidence with this Order evidence', async () => {
    const f = await accepted(),
      other = await accepted(),
      e = await reserved(f);
    await preview(f, f.f.l.image.id).expect(404);
    await preview(other, e.id).expect(404);
    await upload(other, e.id, e.bytes).expect(404);
  });
  it('survives application restart and listing-media cleanup with the same objects and receipt', async () => {
    const f = await accepted(),
      e = await reserved(f),
      key = randomUUID();
    const sent = await upload(f, e.id, e.bytes, f.f.seller, key).expect(200);
    await app.close();
    app = await makeApp();
    expect(
      (await upload(f, e.id, e.bytes, f.f.seller, key).expect(200)).body,
    ).toEqual(sent.body);
    await app.get(MediaWorker).cleanup();
    expect(objects.has(`order-evidence/${e.id}/original`)).toBe(true);
    await preview(f, e.id).expect(200);
  });
  it('rolls back acknowledgement and outbox together when audit insertion fails after storage', async () => {
    const f = await accepted(),
      e = await reserved(f),
      key = randomUUID();
    // Temporary validator rule (like the former failing SQL trigger).
    await db.withRejectingValidator(
      'audit_events',
      { action: 'uploadPackagingEvidence' },
      async () => {
        await upload(f, e.id, e.bytes, f.f.seller, key).expect(500);
      },
    );
    expect((await evidence(e.id)).status).toBe('Pending');
    expect(
      await db.c.mutation_receipts.countDocuments({
        actorId: f.f.seller.id,
        operation: 'uploadPackagingEvidence',
        key,
      }),
    ).toBe(0);
    await upload(f, e.id, e.bytes, f.f.seller, key).expect(200);
  });
  it('serializes 20 same-key intent requests and two same-key binary uploads', async () => {
    const f = await accepted(),
      bytes = await image(),
      key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => intent(f, bytes, f.f.seller, key)),
    );
    // A busy answer (retry budget exhausted) is retried with the same key and
    // must replay the one durable receipt.
    expect(results.every((r) => [200, 503].includes(r.status))).toBe(true);
    for (let i = 0; i < results.length; i++)
      if (results[i].status === 503)
        results[i] = await intent(f, bytes, f.f.seller, key);
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(200));
    expect(new Set(results.map((r) => r.body.entityId)).size).toBe(1);
    const id = results[0].body.entityId,
      ukey = randomUUID();
    const uploaded = await Promise.all([
      upload(f, id, bytes, f.f.seller, ukey),
      upload(f, id, bytes, f.f.seller, ukey),
    ]);
    expect(uploaded.map((r) => r.status)).toEqual([200, 200]);
    expect(uploaded[0].body).toEqual(uploaded[1].body);
    expect(
      await db.c.order_packaging_evidence.countDocuments({ orderId: f.id }),
    ).toBe(1);
  }, 60000);
  it('shares two upload slots with listing uploads and releases them on validation failure', async () => {
    const f = await accepted(),
      e = await reserved(f),
      slots = app.get(ImageUploadSlots);
    const one = slots.claim(),
      two = slots.claim();
    try {
      await upload(f, e.id, e.bytes).expect(429);
    } finally {
      one();
      two();
    }
    await upload(f, e.id, Buffer.alloc(e.bytes.length)).expect(422);
    await upload(f, e.id, e.bytes).expect(200);
  });
  it('allows only one of two unrelated users to consume the last global reservation under a DB barrier', async () => {
    const f = await accepted(),
      g = await accepted(),
      bytes = await image();
    app
      .get(ConfigService)
      .set(
        'MEDIA_STORAGE_BUDGET_BYTES',
        (await budgetTotal()) + bytes.length + 2000000,
      );
    const keys = [randomUUID(), randomUUID()];
    const blocker = await budgetGate();
    const contenders = [
      intent(f, bytes, f.f.seller, keys[0]).then((r) => r),
      intent(g, bytes, g.f.seller, keys[1]).then((r) => r),
    ];
    try {
      await blocker.contended(2);
      await blocker.commit();
    } finally {
      await blocker.close();
    }
    const results = await Promise.all(contenders);
    // A busy answer is retried with the same key; the decision must stand.
    for (let i = 0; i < results.length; i++)
      if (results[i].status === 503)
        results[i] = await intent(
          [f, g][i],
          bytes,
          [f, g][i].f.seller,
          keys[i],
        );
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
  });
  it('listing uploads count the evidence reservation against the same budget', async () => {
    const f = await accepted();
    await reserved(f);
    const l = await createDraft(f.f.seller),
      bytes = await image();
    app
      .get(ConfigService)
      .set(
        'MEDIA_STORAGE_BUDGET_BYTES',
        (await budgetTotal()) + bytes.length + 6000000 - 1,
      );
    await post(
      `/listings/${l.entityId}/media`,
      {
        expectedVersion: l.version,
        mimeType: 'image/png',
        byteSize: bytes.length,
        sha256: digest(bytes),
      },
      f.f.seller,
    ).expect(429);
  });
  it('checks session expiry after waiting for the global reservation lock', async () => {
    const f = await accepted(),
      bytes = await image();
    const blocker = await budgetGate();
    const contender = intent(f, bytes).then((r) => r);
    try {
      await blocker.contended(1);
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(
        new Date(Date.now() + 2 * 86400000),
      );
      await blocker.commit();
    } finally {
      await blocker.close();
    }
    expect((await contender).status).toBe(401);
    expect(
      await db.c.order_packaging_evidence.countDocuments({ orderId: f.id }),
    ).toBe(0);
  });
  it('rechecks role changes while waiting for the participant lock, even on receipt replay', async () => {
    const f = await accepted(),
      bytes = await image(),
      key = randomUUID();
    await intent(f, bytes, f.f.seller, key).expect(200);
    const gate = await Gate.lockUser(db.client, f.f.seller.id);
    const contender = intent(f, bytes, f.f.seller, key).then((r) => r);
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
    } finally {
      await gate.close();
    }
    expect((await contender).status).toBe(403);
  });
  it('counts the hourly quota across listing and packaging intents', async () => {
    const f = await accepted();
    // Existing listing fixture is one media intent in this seller's current hour.
    for (let i = 0; i < 19; i++) await intent(f, await image()).expect(200);
    await intent(f, await image()).expect(429);
    const l = await createDraft(f.f.seller),
      bytes = await image();
    await post(
      `/listings/${l.entityId}/media`,
      {
        expectedVersion: l.version,
        mimeType: 'image/png',
        byteSize: bytes.length,
        sha256: digest(bytes),
      },
      f.f.seller,
    ).expect(429);
  }, 60000);
  it('enforces the lifetime Order bound even when the hourly window advances', async () => {
    const f = await accepted();
    const realNow = Date.now();
    const clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(realNow + 3601000));
    for (let i = 0; i < 20; i++) await intent(f, await image()).expect(200);
    clock.mockResolvedValue(new Date(realNow + 7202000));
    for (let i = 0; i < 12; i++) await intent(f, await image()).expect(200);
    await intent(f, await image()).expect(429);
    expect((await listing(f).expect(200)).body.items).toHaveLength(32);
  }, 60000);
  it('allows accepted evidence submission racing pickup expiry without moving money or reopening the Order', async () => {
    const f = await accepted(),
      e = await reserved(f);
    const p = await preparation(f.id);
    await setSession(f.f.seller.sessionId, {
      expiresAt: new Date(p.pickupDeadline.getTime() + 86400000),
    });
    // Network barrier: expiry commits while upload holds no database lock.
    storage.afterPut = async (key) => {
      if (!key.endsWith('.webp')) return;
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
      await app.get(OrdersService).expirePickup(f.id);
    };
    await upload(f, e.id, e.bytes).expect(200);
    expect((await db.c.direct_orders.findOne({ _id: f.id }))!.state).toBe(
      'ResolutionPending',
    );
    expect((await evidence(e.id)).status).toBe('Ready');
    expect((await reconcile()).balanced).toBe(true);
  });
  it('keeps submitted evidence when expiry happens after its acknowledgement', async () => {
    const f = await accepted(),
      e = await reserved(f);
    await upload(f, e.id, e.bytes).expect(200);
    const before = await evidence(e.id);
    const p = await preparation(f.id);
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    await app.get(OrdersService).expirePickup(f.id);
    expect(await evidence(e.id)).toEqual(before);
    expect((await db.c.direct_orders.findOne({ _id: f.id }))!.state).toBe(
      'ResolutionPending',
    );
    expect((await reconcile()).balanced).toBe(true);
  });
  it('does not replay evidence receipts to revoked or unverified accounts', async () => {
    const f = await accepted(),
      bytes = await image(),
      key = randomUUID();
    await intent(f, bytes, f.f.seller, key).expect(200);
    await setUser(f.f.seller.id, { emailVerifiedAt: null });
    await intent(f, bytes, f.f.seller, key).expect(401);
    await setUser(f.f.seller.id, { emailVerifiedAt: new Date() });
    await setSession(f.f.seller.sessionId, { revokedAt: new Date() });
    await intent(f, bytes, f.f.seller, key).expect(401);
  });
  it('MongoDB rejects deletion, forged Ready and forged intents without receipts; originals change only through the upload command', async () => {
    const f = await accepted(),
      e = await reserved(f),
      appDb = app.get(MongoService).c,
      pending = await evidence(e.id);
    // P: evidence is never deletable by the application user.
    await expect(
      appDb.order_packaging_evidence.deleteOne({ _id: e.id }),
    ).rejects.toMatchObject({ code: 13 });
    // V: Ready requires every upload field (the former packaging_shape).
    await expect(
      appDb.order_packaging_evidence.updateOne(
        { _id: e.id },
        { $set: { status: 'Ready', version: 2 } },
      ),
    ).rejects.toMatchObject({ code: 121 });
    // I: one intent per Order and hash, so an identity edit cannot collide.
    const other = await reserved(f);
    await expect(
      appDb.order_packaging_evidence.updateOne(
        { _id: e.id },
        { $set: { sha256: (await evidence(other.id)).sha256 } },
      ),
    ).rejects.toMatchObject({ code: 11000 });
    // C: an intent or a Ready transition needs its own receipt chain.
    const forged: OrderPackagingEvidenceDoc = {
      _id: randomUUID(),
      orderId: f.id,
      version: 1,
      status: 'Pending',
      mimeType: 'image/png',
      byteSize: 1,
      sha256: 'f'.repeat(64),
      reservedBytes: 2000001,
      createdAt: new Date(),
      uploadedAt: null,
      derivativeSha256: null,
      derivativeBytes: null,
      width: null,
      height: null,
      createReceiptId: randomUUID(),
      uploadReceiptId: null,
    };
    await expect(
      checked(
        (tx) => tx.c.order_packaging_evidence.insertOne(forged),
        forged._id,
      ),
    ).rejects.toThrow('Packaging intent/receipt mismatch');
    await expect(
      checked(
        (tx) =>
          tx.c.order_packaging_evidence.updateOne(
            { _id: e.id, status: 'Pending' },
            {
              $set: {
                status: 'Ready',
                version: 2,
                uploadedAt: new Date(),
                uploadReceiptId: randomUUID(),
                derivativeSha256: 'c'.repeat(64),
                derivativeBytes: 10,
                width: 12,
                height: 12,
              },
            },
          ),
        e.id,
      ),
    ).rejects.toThrow('Packaging upload/receipt mismatch');
    expect(await evidence(e.id)).toEqual(pending);
    expect(
      await db.c.order_packaging_evidence.countDocuments({ _id: forged._id }),
    ).toBe(0);
    await upload(f, e.id, e.bytes).expect(200);
    const ready = await evidence(e.id);
    // W: the upload command is the only writer; it keeps identity fields and
    // a Ready image never re-enters upload (new key conflicts, bytes kept).
    expect(ready).toMatchObject({
      orderId: pending.orderId,
      mimeType: pending.mimeType,
      byteSize: pending.byteSize,
      sha256: pending.sha256,
      reservedBytes: pending.reservedBytes,
      createdAt: pending.createdAt,
      createReceiptId: pending.createReceiptId,
    });
    await upload(f, e.id, e.bytes).expect(409);
    expect(await evidence(e.id)).toEqual(ready);
    expect((await reconcile()).balanced).toBe(true);
  });
});
