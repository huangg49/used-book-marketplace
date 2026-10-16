import { prepareSellerOrder } from './helpers/seller-order.js';
import { OrderClock } from '../src/modules/orders/order-clock.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';

import { OrdersService } from '../src/modules/orders/orders.service.js';
import { OrderExpiryWorker } from '../src/modules/orders/order-expiry.service.js';
import { checkOrder } from '../src/modules/orders/order-invariants.js';

import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import request from 'supertest';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
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

// Storage signing is deliberately faked. HTTP, authorization and MongoDB are real.
const storage = {
  beforeSign: undefined as (() => Promise<void>) | undefined,
  async check() {},
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

describe('Order acceptance and pickup review: real MongoDB and HTTP', () => {
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
  // Test-only pause of the next Order decision, inside its transaction and
  // while it holds the user/listing/order locks. PostgreSQL granted queued
  // row locks in FIFO order; MongoDB aborts and retries the loser, so the
  // intended winner is made explicit by holding it here.
  function pauseDecision(at?: Date) {
    const clock = app.get(OrderClock),
      original = clock.now.bind(clock);
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve)),
      released = new Promise<void>((resolve) => (release = resolve));
    const spy = vi
      .spyOn(clock, 'now')
      .mockImplementationOnce(async (tx: Tx) => {
        entered();
        await released;
        return at ?? original(tx);
      });
    return { reached, release, spy };
  }
  // A raw write through the application's own connection that must pass the
  // commit-time Order check (C) every command registers, the equivalent of
  // the deferred PostgreSQL constraint triggers.
  const checked = (fn: (tx: Tx) => Promise<unknown>, order: string) =>
    app.get(MongoService).tx(async (tx) => {
      await fn(tx);
      tx.check(`order:${order}`, () => checkOrder(tx, order));
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
    // Exercise the schema run with a real active reservation and posted topup,
    // built through the pre-existing APIs. PostgreSQL applied migration
    // 20260928030000 here; MongoDB's baseline already contains the preparation
    // collections, so re-running the migrations must be a no-op.
    legacy = await ready();
    upgradeBefore = await snapshot();
    upgradeApplied = await migrate(db.client, db.client.db());
    upgradeAfter = await snapshot();
  }, 60000);
  afterAll(async () => {
    storage.beforeSign = undefined;
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
  const findOrder = async (id: string) =>
    (await db.c.direct_orders.findOne({ _id: id }))!;
  const preparation = async (orderId: string) =>
    (await db.c.order_preparations.findOne({ _id: orderId }))!;
  const preparations = (orderId: string) =>
    db.c.order_preparations.countDocuments({ _id: orderId });
  const pickupReviews = (orderId: string) =>
    db.c.pickup_reviews.countDocuments({ orderId });
  const journals = (orderId: string) =>
    db.c.ledger_journals.countDocuments({ orderId });
  async function stateCounts(listingId: string) {
    const c = db.c;
    const ids = (await c.workflow_items.find({ listingId }).toArray()).map(
        (i) => i.contextId,
      ),
      orderIds = (
        await c.workflow_contexts.find({ _id: { $in: ids } }).toArray()
      ).flatMap((x) => x.orderId ?? []),
      commitments = (
        await c.exclusive_commitments.find({ listingId }).toArray()
      ).map((x) => x._id),
      audits = (
        await c.audit_events.find({ contextId: { $in: ids } }).toArray()
      ).map((a) => a._id);
    return {
      orders: await c.direct_orders.countDocuments({ _id: { $in: orderIds } }),
      items: await c.workflow_items.countDocuments({ contextId: { $in: ids } }),
      agreements: await c.agreement_snapshots.countDocuments({
        _id: { $in: ids },
      }),
      active: await c.exclusive_commitments.countDocuments({
        listingId,
        status: 'Active',
      }),
      events: await c.commitment_events.countDocuments({
        commitmentId: { $in: commitments },
      }),
      receipts: await c.mutation_receipts.countDocuments({
        contextId: { $in: ids },
      }),
      audits: audits.length,
      outbox: await c.outbox_events.countDocuments({
        auditId: { $in: audits },
      }),
    };
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
  const cancelPaid = (
    f: PaymentFixture,
    key = randomUUID(),
    actor = f.f.buyer,
    version = 2,
  ) =>
    post(
      `/orders/${f.id}/cancel-paid`,
      { expectedVersion: version },
      actor,
      key,
    );
  const reject = (f: PaymentFixture, actor = f.f.seller) =>
    post(`/orders/${f.id}/reject`, { expectedVersion: 2 }, actor);
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
  it('re-running migrations over real unpaid commitments preserves immutable snapshots, journals and receipts', async () => {
    // PostgreSQL: applying 20260928030000 over twelve migrations left these
    // tables unchanged. MongoDB: the preparation model is in the baseline and
    // migrations are checksummed and idempotent, so nothing is pending.
    expect(upgradeApplied).toEqual([]);
    expect(await pendingMigrations(app.get(MongoService).db)).toEqual([]);
    expect(upgradeAfter).toEqual(upgradeBefore);
    await pay(legacy).expect(200);
    await accept(legacy).expect(200);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('seller accepts exactly once, freezes 48h pickup deadline and sees buyer destination only after acceptance', async () => {
    const f = await paid(),
      key = randomUUID(),
      before = await stateCounts(f.f.l.entityId),
      funds = await wallet(f.f.buyer);
    const beforeSeller = await orderView(f.id, f.f.seller);
    expect(beforeSeller.shippingAddress).toBeNull();
    expect(beforeSeller.sellerAcceptanceEnabled).toBe(true);
    const result = (await accept(f, key).expect(200)).body;
    validates('TransactionCommandReceipt', result);
    expect(result).toMatchObject({
      state: 'Preparing',
      version: 3,
      affectedListings: [],
    });
    const seller = await orderView(f.id, f.f.seller),
      buyer = await orderView(f.id, f.f.buyer);
    expect(seller.shippingAddress).toEqual(buyer.ownAddress);
    expect(buyer.shippingAddress).toBeNull();
    expect(seller.preparation.pickupReview).toBeNull();
    expect(
      new Date(seller.preparation.pickupDeadline).getTime() -
        new Date(seller.preparation.acceptedAt).getTime(),
    ).toBe(48 * 3600000);
    expect(seller).toMatchObject({
      canReject: false,
      sellerAcceptanceEnabled: false,
      shipmentRegistrationEnabled: false,
    });
    expect(buyer.canRequestRefund).toBe(false);
    expect(seller.moneyHeld).toBe(seller.amounts.buyerTotal);
    expect(await wallet(f.f.buyer)).toMatchObject({
      available: funds.available,
      transactionHeld: funds.transactionHeld,
    });
    expect((await wallet(f.f.seller)).available).toBe(0);
    expect(await stateCounts(f.f.l.entityId)).toMatchObject({
      active: 1,
      events: before.events,
      receipts: before.receipts + 1,
    });
    expect(
      (await db.c.listings.findOne({ _id: f.f.l.entityId }))!.version,
    ).toBe(f.f.l.version + 1);
    expect(await journals(f.id)).toBe(1);
    await cancelPaid(f, randomUUID(), f.f.buyer, 3).expect(409);
    await reject(f).expect(409);
    await accept(f).expect(409);
    const replay = await accept(f, key).expect(200);
    expect(replay.body).toEqual(result);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await accept(f, key, f.f.seller, 3).expect(409);
    await app.close();
    app = await makeApp();
    expect((await accept(f, key).expect(200)).body).toEqual(result);
    expect((await get('/listings/' + f.f.l.entityId).expect(200)).body.purchaseAvailability.status).toBe('InNegotiation');
    await get('/me/orders/' + f.id, await reader()).expect(404);
    expect(
      (await get('/me/orders?state=Preparing', f.f.seller).expect(200)).body
        .items[0].id,
    ).toBe(f.id);
    const audit = (await db.c.audit_events.findOne({ receiptId: result.id }))!;
    expect(audit.before).toEqual({
      state: 'PendingSellerConfirmation',
      version: 2,
    });
  });
  it('shipping uses frozen destination even after the buyer edits their address', async () => {
    const f = await paid(),
      frozen = (await orderView(f.id, f.f.buyer)).ownAddress;
    // Raw content edit following the address write protocol (version +1).
    await db.c.member_addresses.updateOne(
      { _id: f.f.destination.id },
      { $set: { detail: 'Edited after agreement' }, $inc: { version: 1 } },
    );
    await accept(f).expect(200);
    expect((await orderView(f.id, f.f.seller)).shippingAddress).toEqual(frozen);
  });
  it.each([
    'buyer',
    'foreign',
    'staff',
    'admin',
    'disabled',
    'unverified',
    'role',
    'revoked',
  ] as const)('rejects %s without preparation or receipt', async (kind) => {
    const f = await paid();
    let actor = f.f.seller,
      status = 403;
    if (kind === 'buyer') {
      actor = f.f.buyer;
      status = 404;
    }
    if (kind === 'foreign') {
      actor = await reader();
      status = 404;
    }
    if (kind === 'staff') actor = staff;
    if (kind === 'admin') actor = a2;
    if (kind === 'disabled') {
      await setUser(actor.id, { status: 'DISABLED' });
      status = 401;
    }
    if (kind === 'unverified') {
      await setUser(actor.id, { emailVerifiedAt: null });
      status = 401;
    }
    if (kind === 'role') await setUser(actor.id, { roles: [] });
    if (kind === 'revoked') {
      await setSession(actor.sessionId, { revokedAt: new Date() });
      status = 401;
    }
    const before = await stateCounts(f.f.l.entityId);
    await accept(f, randomUUID(), actor).expect(status);
    expect(await stateCounts(f.f.l.entityId)).toEqual(before);
    expect(await preparations(f.id)).toBe(0);
  });
  it.each(['RESTRICTED', 'LOCKED'] as const)(
    '%s seller can process paid obligations even if buyer is disabled',
    async (status) => {
      const f = await paid();
      await db.setStatus(f.f.seller.id, status);
      await db.setStatus(f.f.buyer.id, 'DISABLED');
      const key = randomUUID();
      await accept(f, key).expect(200);
      await accept(f, key).expect(200);
      expect(
        (await orderView(f.id, f.f.seller)).shippingAddress,
      ).not.toBeNull();
    },
  );
  it('blocks unpaid/closed orders, wrong versions and client-supplied deadlines', async () => {
    const f = await ready();
    await accept(f, randomUUID(), f.f.seller, 1).expect(409);
    await pay(f).expect(200);
    await accept(f, randomUUID(), f.f.seller, 99).expect(409);
    await post(
      '/orders/' + f.id + '/accept',
      { expectedVersion: 2, pickupDeadline: new Date().toISOString() },
      f.f.seller,
    ).expect(422);
    await request(app.getHttpServer())
      .post('/api/v1/orders/' + f.id + '/accept')
      .send({ expectedVersion: 2 })
      .expect(401);
    await cancelPaid(f).expect(200);
    await accept(f).expect(409);
    await app.get(OrdersService).refund(f.id);
    await accept(f).expect(409);
  });
  it.each([-1, 0, 1])(
    'acceptance at confirmation deadline offset %i',
    async (offset) => {
      const f = await paid(),
        o = await findOrder(f.id),
        time = new Date(o.sellerConfirmationDeadline!.getTime() + offset);
      await setSession(f.f.seller.sessionId, {
        expiresAt: new Date(time.getTime() + 3600000),
      });
      const clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(time);
      try {
        await accept(f).expect(offset < 0 ? 200 : 409);
      } finally {
        clock.mockRestore();
      }
      expect(await preparations(f.id)).toBe(offset < 0 ? 1 : 0);
    },
  );
  it.each(['accept', 'cancel'] as const)(
    '%s wins against the other command with a verified database barrier',
    async (first) => {
      const f = await paid(),
        pause = pauseDecision(),
        retries = watchRetries(),
        a = () => accept(f).then((r) => r),
        b = () => cancelPaid(f).then((r) => r);
      const one = first === 'accept' ? a() : b();
      let two: ReturnType<typeof a> | undefined;
      try {
        await pause.reached;
        two = first === 'accept' ? b() : a();
        // The loser contends for the participant locks the winner holds.
        await retries.until(1);
        pause.release();
        expect((await one).status).toBe(200);
        expect((await two).status).toBe(409);
      } finally {
        pause.release();
        retries.stop();
        pause.spy.mockRestore();
        await one;
        await two;
      }
      expect((await orderView(f.id, f.f.buyer)).state).toBe(
        first === 'accept' ? 'Preparing' : 'SettlementPending',
      );
      expect(await preparations(f.id)).toBe(first === 'accept' ? 1 : 0);
      if (first === 'accept')
        await expect(
          app.get(OrdersService).refund(f.id),
        ).rejects.toHaveProperty('status', 409);
      else await app.get(OrdersService).refund(f.id);
    },
  );
  it.each(['deadline', 'session', 'role', 'revocation'] as const)(
    'rechecks %s after waiting for user locks',
    async (kind) => {
      const f = await paid(),
        o = await findOrder(f.id),
        gate = await Gate.lockUser(db.client, f.f.seller.id),
        clock = vi.spyOn(app.get(OrderClock), 'now'),
        call = accept(f).then((r) => r);
      try {
        await gate.contended();
        expect(clock).not.toHaveBeenCalled();
        const inGate = { session: gate.session };
        const sessions = gate.db.collection<{ _id: string }>('auth_sessions');
        if (kind === 'deadline') {
          await sessions.updateOne(
            { _id: f.f.seller.sessionId },
            {
              $set: {
                expiresAt: new Date(
                  o.sellerConfirmationDeadline!.getTime() + 3600000,
                ),
              },
              $inc: { lockSeq: 1 },
            },
            inGate,
          );
          clock.mockResolvedValue(o.sellerConfirmationDeadline!);
        } else if (kind === 'session') {
          const time = new Date(Date.now() + 60000);
          await sessions.updateOne(
            { _id: f.f.seller.sessionId },
            { $set: { expiresAt: time }, $inc: { lockSeq: 1 } },
            inGate,
          );
          clock.mockResolvedValue(time);
        } else if (kind === 'role')
          await gate.db
            .collection<{ _id: string }>('users')
            .updateOne(
              { _id: f.f.seller.id },
              { $pull: { roles: { role: 'MEMBER' } } } as never,
              inGate,
            );
        else
          await sessions.updateOne(
            { _id: f.f.seller.sessionId },
            { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
            inGate,
          );
        await gate.commit();
        expect((await call).status).toBe(
          kind === 'deadline' ? 409 : kind === 'role' ? 403 : 401,
        );
      } finally {
        await gate.close();
        await call;
        clock.mockRestore();
      }
      expect(await preparations(f.id)).toBe(0);
    },
  );
  it('concurrent same-key acceptance survives lost acknowledgments with one receipt and deadline', async () => {
    const f = await paid(),
      gate = await Gate.lockUser(db.client, f.f.seller.id),
      key = randomUUID(),
      calls = Array.from({ length: 20 }, () => accept(f, key).then((r) => r));
    try {
      await gate.contended(10);
      await gate.commit();
      const results = await Promise.all(calls);
      expect(results.every((r) => [200, 503].includes(r.status))).toBe(true);
      // A busy answer (retry budget exhausted) is retried with the same key
      // and must replay the one durable receipt.
      for (let i = 0; i < results.length; i++)
        if (results[i].status === 503)
          results[i] = await accept(f, key).expect(200);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
    expect(await preparations(f.id)).toBe(1);
  }, 60000);
  it.each([
    'order_preparations',
    'direct_orders',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ] as const)(
    'acceptance failure at %s rolls back and same key retries',
    async (collection) => {
      const f = await paid(),
        key = randomUUID(),
        before = await stateCounts(f.f.l.entityId);
      // Temporary validator rule rejecting the acceptance write (like the
      // former failing BEFORE INSERT/UPDATE trigger on the table).
      const rejectWhen = {
        order_preparations: { _id: f.id },
        direct_orders: { _id: f.id, state: 'Preparing' },
        mutation_receipts: {
          operation: 'acceptOrder',
          contextId: f.r.contextId,
        },
        audit_events: { action: 'acceptOrder', contextId: f.r.contextId },
        outbox_events: { type: 'OrderAccepted', 'payload.entityId': f.id },
      }[collection];
      await db.withRejectingValidator(collection, rejectWhen, async () => {
        await accept(f, key).expect(500);
      });
      expect(await stateCounts(f.f.l.entityId)).toEqual(before);
      expect(await preparations(f.id)).toBe(0);
      await accept(f, key).expect(200);
    },
  );
  it.each([-1, 0, 1])(
    'pickup deadline offset %i opens a review without refund or stock release',
    async (offset) => {
      const f = await paid();
      await accept(f).expect(200);
      const p = await preparation(f.id),
        clock = vi
          .spyOn(app.get(OrderClock), 'now')
          .mockResolvedValue(new Date(p.pickupDeadline.getTime() + offset));
      try {
        if (offset < 0)
          await expect(
            app.get(OrdersService).expirePickup(f.id),
          ).rejects.toHaveProperty('status', 409);
        else {
          const r = await app.get(OrdersService).expirePickup(f.id);
          validates('TransactionCommandReceipt', r.receipt);
          expect(r.receipt.state).toBe('ResolutionPending');
        }
      } finally {
        clock.mockRestore();
      }
      expect(await pickupReviews(f.id)).toBe(offset < 0 ? 0 : 1);
      expect((await stateCounts(f.f.l.entityId)).active).toBe(1);
      expect((await wallet(f.f.buyer)).transactionHeld).toBe(230000);
      expect(await journals(f.id)).toBe(1);
      if (offset >= 0) {
        expect(
          (await orderView(f.id, f.f.buyer)).preparation.pickupReview.status,
        ).toBe('Open');
        await expect(
          app.get(OrdersService).refund(f.id),
        ).rejects.toHaveProperty('status', 409);
      }
    },
  );
  it('pickup worker survives failures/restart and disabled participants; two commands create one unresolved review', async () => {
    const f = await paid();
    await accept(f).expect(200);
    const p = await preparation(f.id);
    for (const id of [f.f.buyer.id, f.f.seller.id])
      await db.setStatus(id, 'DISABLED');
    let clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(p.pickupDeadline);
    try {
      // Temporary validator rule (like the former failing SQL trigger).
      await db.withRejectingValidator(
        'pickup_reviews',
        { orderId: f.id },
        async () => {
          await expect(
            app.get(OrdersService).expirePickup(f.id),
          ).rejects.toBeDefined();
        },
      );
    } finally {
      clock.mockRestore();
    }
    expect((await findOrder(f.id)).state).toBe('Preparing');
    await app.close();
    app = await makeApp();
    clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(p.pickupDeadline);
    const gate = await Gate.lockUser(db.client, f.f.buyer.id),
      calls = [
        app.get(OrdersService).expirePickup(f.id),
        app.get(OrdersService).expirePickup(f.id),
      ];
    try {
      await gate.contended(2);
      await gate.commit();
      const r = await Promise.all(calls);
      expect(r[0].receipt).toEqual(r[1].receipt);
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
      clock.mockRestore();
    }
    expect(await pickupReviews(f.id)).toBe(1);
    expect(await journals(f.id)).toBe(1);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('commit-time checks refuse forged acceptance/review; MongoDB refuses changed deadlines or deleting preparation history', async () => {
    const f = await paid();
    // C (formerly the deferred latlai_check_order_preparation trigger).
    await expect(
      checked(
        (tx) =>
          tx.c.direct_orders.updateOne(
            { _id: f.id },
            { $set: { state: 'Preparing' }, $inc: { version: 1 } },
          ),
        f.id,
      ),
    ).rejects.toThrow('Order acceptance receipt/deadline mismatch');
    await accept(f).expect(200);
    await expect(
      checked(
        (tx) =>
          tx.c.direct_orders.updateOne(
            { _id: f.id },
            { $set: { state: 'ResolutionPending' }, $inc: { version: 1 } },
          ),
        f.id,
      ),
    ).rejects.toThrow('Pickup verification task mismatch');
    expect(await findOrder(f.id)).toMatchObject({
      state: 'Preparing',
      version: 3,
    });
    const p = await preparation(f.id),
      appDb = app.get(MongoService).c,
      moved = {
        $set: {
          pickupDeadline: new Date(p.pickupDeadline.getTime() + 3600000),
        },
      };
    // V: the deadline is always acceptance + 48h (the former CHECK, 23514).
    await expect(
      db.c.order_preparations.updateOne({ _id: f.id }, moved),
    ).rejects.toMatchObject({ code: 121 });
    // P: preparation history is append-only for the application user.
    await expect(
      appDb.order_preparations.updateOne({ _id: f.id }, moved),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      appDb.order_preparations.deleteOne({ _id: f.id }),
    ).rejects.toMatchObject({ code: 13 });
    expect(await preparation(f.id)).toEqual(p);
  });
  it('worker scans overdue preparations and reports unresolved reviews separately from executable backlog', async () => {
    const f = await paid();
    await accept(f).expect(200);
    const p = await preparation(f.id),
      clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(new Date(p.pickupDeadline.getTime() + 1000));
    try {
      const r = await app.get(OrderExpiryWorker).tick();
      expect(r.failed).toBe(0);
      expect(r.pickupRemaining).toBe(0);
      expect(r.openPickupReviews).toBeGreaterThan(0);
      expect(r.oldestPickupReviewAgeSeconds).toBeGreaterThanOrEqual(0);
      const before = await db.c.pickup_reviews.countDocuments();
      const again = await app.get(OrderExpiryWorker).tick();
      expect(again.openPickupReviews).toBe(before);
      expect(await db.c.pickup_reviews.countDocuments()).toBe(before);
    } finally {
      clock.mockRestore();
    }
    expect((await orderView(f.id, f.f.buyer)).state).toBe('ResolutionPending');
    expect((await reconcile()).balanced).toBe(true);
  }, 60000);
  it.each(['accept', 'expiry'] as const)(
    '%s wins confirmation race without refunding an accepted Order',
    async (first) => {
      const f = await paid(),
        o = await findOrder(f.id),
        time = new Date(
          o.sellerConfirmationDeadline!.getTime() +
            (first === 'accept' ? -1 : 0),
        );
      await setSession(f.f.seller.sessionId, {
        expiresAt: new Date(time.getTime() + 3600000),
      });
      const pause = pauseDecision(time);
      pause.spy.mockResolvedValue(time);
      const retries = watchRetries();
      const a = () => accept(f).then((r) => ({ status: r.status })),
        b = () =>
          app
            .get(OrdersService)
            .expireConfirmation(f.id)
            .then(() => ({ status: 200 }))
            .catch((e) => ({ status: e.getStatus() }));
      const one = first === 'accept' ? a() : b();
      let two: ReturnType<typeof a> | undefined;
      try {
        await pause.reached;
        two = first === 'accept' ? b() : a();
        // The loser contends for the participant locks the winner holds.
        await retries.until(1);
        pause.release();
        expect((await one).status).toBe(200);
        expect((await two).status).toBe(409);
      } finally {
        pause.release();
        retries.stop();
        await one;
        await two;
        pause.spy.mockRestore();
      }
      expect((await orderView(f.id, f.f.buyer)).state).toBe(
        first === 'accept' ? 'Preparing' : 'SettlementPending',
      );
    },
  );
  it('acceptance checks deadline after waiting for the hold account lock', async () => {
    const f = await paid(),
      o = await findOrder(f.id),
      hold = (await db.c.wallet_accounts.findOne({ orderId: f.id }))!;
    await setSession(f.f.seller.sessionId, {
      expiresAt: new Date(o.sellerConfirmationDeadline!.getTime() + 3600000),
    });
    // The posting lock document of the hold account (ledger_entry_lock).
    const gate = await Gate.lock(db.client, 'account_locks', [hold._id]);
    const clock = vi.spyOn(app.get(OrderClock), 'now'),
      call = accept(f).then((r) => r);
    try {
      await gate.contended();
      expect(clock).not.toHaveBeenCalled();
      clock.mockResolvedValue(o.sellerConfirmationDeadline!);
      await gate.commit();
      expect((await call).status).toBe(409);
    } finally {
      await gate.close();
      await call;
      clock.mockRestore();
    }
    expect(await preparations(f.id)).toBe(0);
  });
  it.each([
    'direct_orders',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ] as const)(
    'overdue review failure at %s is atomic and retryable',
    async (collection) => {
      const f = await paid();
      await accept(f).expect(200);
      const p = await preparation(f.id),
        before = await stateCounts(f.f.l.entityId),
        clock = vi
          .spyOn(app.get(OrderClock), 'now')
          .mockResolvedValue(p.pickupDeadline);
      const rejectWhen = {
        direct_orders: { _id: f.id, state: 'ResolutionPending' },
        mutation_receipts: {
          operation: 'expireOrderPickup',
          contextId: f.r.contextId,
        },
        audit_events: {
          action: 'expireOrderPickup',
          contextId: f.r.contextId,
        },
        outbox_events: {
          type: 'OrderPickupReviewOpened',
          'payload.entityId': f.id,
        },
      }[collection];
      try {
        await db.withRejectingValidator(collection, rejectWhen, async () => {
          await expect(
            app.get(OrdersService).expirePickup(f.id),
          ).rejects.toBeDefined();
        });
      } finally {
        clock.mockRestore();
      }
      expect(await stateCounts(f.f.l.entityId)).toEqual(before);
      expect(await pickupReviews(f.id)).toBe(0);
      const retryClock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(p.pickupDeadline);
      try {
        await app.get(OrdersService).expirePickup(f.id);
      } finally {
        retryClock.mockRestore();
      }
      expect(await pickupReviews(f.id)).toBe(1);
    },
  );
});
