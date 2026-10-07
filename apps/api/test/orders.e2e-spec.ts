import { OrderClock } from '../src/modules/orders/order-clock.js';
import { QuoteClock } from '../src/modules/quotes/quote-clock.js';
import { spawn } from 'node:child_process';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { OrderExpiryWorker } from '../src/modules/orders/order-expiry.service.js';
import { checkOrder } from '../src/modules/orders/order-invariants.js';
import { checkListing } from '../src/modules/listings/listing-projection.js';
import { ReservationsService } from '../src/modules/reservations/reservations.service.js';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type {
  DirectOrderDoc,
  RoleCode,
  UserStatus,
} from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import {
  onTransactionRetry,
  type Tx,
} from '../src/database/mongo/transaction.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

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

describe('Unpaid DirectDelivery orders HTTP and MongoDB', () => {
  let app: INestApplication, db: MongoFixtures;
  const users: string[] = [];
  let m1: Reader, m2: Reader, a1: Reader, a2: Reader, staff: Reader;
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
    configureApp(next, { docs: false, logRequests: false });
    await next.init();
    // One listening socket per app lifetime: supertest otherwise listens and
    // closes per request, which can reset connections of the staggered 503
    // retries in the 100-request races.
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
  // commit-time order/listing checks (C) every command registers, the
  // equivalent of the deferred PostgreSQL constraint triggers.
  const checked = (
    fn: (tx: Tx) => Promise<unknown>,
    check: { order?: string; listing?: string },
  ) =>
    app.get(MongoService).tx(async (tx) => {
      await fn(tx);
      if (check.order)
        tx.check(`order:${check.order}`, () => checkOrder(tx, check.order!));
      if (check.listing)
        tx.check(`listing:${check.listing}`, () =>
          checkListing(tx, check.listing!),
        );
    });

  beforeAll(async () => {
    app = await makeApp();
    db = await MongoFixtures.connect();
    m1 = await reader();
    m2 = await reader();
    a1 = await reader(['MEMBER', 'ADMIN']);
    a2 = await reader(['ADMIN']);
    staff = await reader(['STAFF']);
  }, 60000);
  afterAll(async () => {
    storage.beforeSign = undefined;
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
      await c.commitment_events.deleteMany({
        commitmentId: { $in: commitments },
      });
      await c.exclusive_commitments.deleteMany({ _id: { $in: commitments } });
      await c.agreement_snapshots.deleteMany({ _id: { $in: contexts } });
      await c.workflow_items.deleteMany({ contextId: { $in: contexts } });
      await c.workflow_contexts.deleteMany({ _id: { $in: contexts } });
      await c.direct_orders.deleteMany({ _id: { $in: orders } });
      await c.sale_quotes.deleteMany({ buyerId: { $in: users } });
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
        $or: [{ actorId: { $in: users } }, { contextId: { $in: contexts } }],
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
  async function mutateAddress(owner: Reader, id: string, remove = false) {
    const b = (await get('/me/addresses', owner).expect(200)).body;
    if (remove)
      return post(
        `/me/addresses/${id}/archive`,
        { expectedBookVersion: b.version },
        owner,
      ).expect(200);
    return request(app.getHttpServer())
      .put(`/api/v1/me/addresses/${id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedBookVersion: b.version,
        address: {
          ...addressInput,
          detail: 'Changed private address, only a fixture',
        },
        makeDefault: false,
      })
      .expect(200);
  }
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
  const cancel = (id: string, actor: Reader, key = randomUUID(), version = 1) =>
    post(`/orders/${id}/cancel`, { expectedVersion: version }, actor, key);
  async function orderView(id: string, actor: Reader) {
    const r = await get(`/me/orders/${id}`, actor).expect(200);
    validates('PrivateUnpaidOrder', r.body);
    expect(r.headers['cache-control']).toContain('no-store');
    return r.body;
  }
  const findOrder = async (id: string) =>
    (await db.c.direct_orders.findOne({ _id: id }))!;
  async function stateCounts(listingId: string) {
    const c = db.c;
    const ids = (await c.workflow_items.find({ listingId }).toArray()).map(
        (i) => i.contextId,
      ),
      orderIds = (
        await c.workflow_contexts.find({ _id: { $in: ids } }).toArray()
      ).flatMap((x) => x.orderId ?? []),
      commitments = (await c.exclusive_commitments.find({ listingId }).toArray())
        .map((x) => x._id),
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
  it('creates a 15-minute immutable unpaid agreement, reserves stock, hides public reads and keeps contact private by role', async () => {
    const p = await prepared(),
      r = await create(p).expect(200);
    validates('TransactionCommandReceipt', r.body);
    const buyer = await orderView(r.body.entityId, p.f.buyer),
      seller = await orderView(r.body.entityId, p.f.seller);
    expect(buyer.state).toBe('AwaitingPayment');
    expect(buyer.paymentEnabled).toBe(true);
    expect(buyer.moneyHeld).toBe(0);
    expect(buyer.canCancel).toBe(true);
    expect(seller.canCancel).toBe(false);
    expect(
      Date.parse(buyer.paymentDeadline) - Date.parse(buyer.createdAt),
    ).toBe(900000);
    expect(buyer.amounts.buyerTotal).toBe(230000);
    expect(buyer.item.listingRevisionId).toBe(p.body.expectedListingRevisionId);
    expect(buyer.commitment.status).toBe('Active');
    expect(r.body.affectedListings).toEqual([
      { id: p.f.l.entityId, version: p.f.l.version + 1 },
    ]);
    expect(await stateCounts(p.f.l.entityId)).toEqual({
      orders: 1,
      items: 1,
      agreements: 1,
      active: 1,
      events: 1,
      receipts: 1,
      audits: 1,
      outbox: 1,
    });
    expect(seller).not.toHaveProperty('destination');
    expect(JSON.stringify(seller)).not.toContain(
      `Private contact location ${p.f.buyer.id}`,
    );
    expect(JSON.stringify(buyer)).not.toContain(
      `Private contact location ${p.f.seller.id}`,
    );
    expect(seller).not.toHaveProperty('buyerId');
    expect(buyer).not.toHaveProperty('origin');
    // An upper-case path id is the same Order (UUIDs are case-insensitive).
    expect((await orderView(buyer.id.toUpperCase(), p.f.buyer)).id).toBe(
      buyer.id,
    );
    await get(`/listings/${p.f.l.entityId}`).expect(404);
    expect(
      (await get(`/listings?bookId=${p.f.l.book.entityId}`).expect(200)).body
        .items,
    ).toEqual([]);
    await get(
      `/listings/${p.f.l.entityId}/media/${p.f.l.image.id}/read`,
    ).expect(404);
    for (const actor of [p.f.buyer, p.f.seller]) {
      const image = await get(
        `/me/orders/${buyer.id}/media/${p.f.l.image.id}/read`,
        actor,
      ).expect(200);
      validates('MediaRead', image.body);
    }
    const audits = await db.c.audit_events
      .find({ contextId: buyer.contextId })
      .toArray();
    const history = {
      audits,
      receipts: await db.c.mutation_receipts
        .find({ _id: { $in: audits.map((a) => a.receiptId!) } })
        .toArray(),
      outbox: await db.c.outbox_events
        .find({ auditId: { $in: audits.map((a) => a._id) } })
        .toArray(),
    };
    expect(history.receipts).toHaveLength(1);
    expect(history.outbox).toHaveLength(1);
    for (const secret of [
      addressInput.phone,
      addressInput.detail,
      addressInput.recipientName,
    ])
      expect(JSON.stringify(history)).not.toContain(secret);
  });
  it('creates a sale Order from Both without treating exchange value as money held', async () => {
    const p = await prepared(await setup(210000, 'Both')),
      r = (await create(p).expect(200)).body;
    const view = await orderView(r.entityId, p.f.buyer);
    expect(view.amounts.bookPrice).toBe(210000);
    expect(view.moneyHeld).toBe(0);
  });
  it('rejects forged amounts, principal, foreign quote, self purchase, stale versions and guest/operations roles', async () => {
    const p = await prepared();
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(p.body)
      .expect(401);
    for (const actor of [staff, a2])
      await create(p, randomUUID(), actor).expect(403);
    await create(p, randomUUID(), p.f.seller).expect(404);
    await create(p, randomUUID(), m2).expect(404);
    for (const extra of [
      { amount: 1 },
      { systemActor: 'OrderExpiry' },
      { state: 'Paid' },
      { safeToRelease: true },
    ])
      await create(p, randomUUID(), p.f.buyer, { ...p.body, ...extra }).expect(
        422,
      );
    await create(p, randomUUID(), p.f.buyer, {
      ...p.body,
      expectedListingVersion: 1,
    }).expect(409);
    await create(p, randomUUID(), p.f.buyer, {
      ...p.body,
      expectedListingRevisionId: randomUUID(),
    }).expect(409);
    await create(p, randomUUID(), p.f.buyer, {
      ...p.body,
      expectedQuoteVersion: 2,
    }).expect(422);
    expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
  });
  it('keeps agreement and pinned media readable after address deletion; unrelated users cannot read or cancel', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body,
      before = await orderView(r.entityId, p.f.buyer);
    await mutateAddress(p.f.buyer, p.f.destination.id, true);
    await mutateAddress(p.f.seller, p.f.origin.id, true);
    expect((await orderView(r.entityId, p.f.buyer)).ownAddress).toEqual(
      before.ownAddress,
    );
    for (const actor of [m1, m2]) {
      await get(`/me/orders/${r.entityId}`, actor).expect(404);
      await cancel(r.entityId, actor).expect(404);
      await get(
        `/me/orders/${r.entityId}/media/${p.f.l.image.id}/read`,
        actor,
      ).expect(404);
    }
    await cancel(r.entityId, p.f.seller).expect(404);
    await get(`/me/orders/${r.entityId}`, staff).expect(403);
    await get(
      `/me/orders/${r.entityId}/media/${randomUUID()}/read`,
      p.f.buyer,
    ).expect(404);
    await cancel(r.entityId, p.f.buyer).expect(200);
    expect((await orderView(r.entityId, p.f.buyer)).commitment.status).toBe(
      'Released',
    );
    await get(
      `/me/orders/${r.entityId}/media/${p.f.l.image.id}/read`,
      p.f.buyer,
    ).expect(200);
  });
  it('replays create/cancel after closure and restart without duplicate effects, but rechecks roles/session', async () => {
    const p = await prepared(),
      key = randomUUID(),
      r = (await create(p, key).expect(200)).body,
      ck = randomUUID();
    const cancelled = (await cancel(r.entityId, p.f.buyer, ck).expect(200))
      .body;
    await app.close();
    app = await makeApp();
    expect((await create(p, key).expect(200)).body).toEqual(r);
    expect((await cancel(r.entityId, p.f.buyer, ck).expect(200)).body).toEqual(
      cancelled,
    );
    await create(p, key, p.f.buyer, {
      ...p.body,
      expectedListingVersion: 1,
    }).expect(409);
    expect(await stateCounts(p.f.l.entityId)).toEqual({
      orders: 1,
      items: 1,
      agreements: 1,
      active: 0,
      events: 2,
      receipts: 2,
      audits: 2,
      outbox: 2,
    });
    await setUser(p.f.buyer.id, { roles: [] });
    await create(p, key).expect(403);
    await db.addRole(p.f.buyer.id, 'MEMBER');
    await setSession(p.f.buyer.sessionId, { revokedAt: new Date() });
    await cancel(r.entityId, p.f.buyer, ck).expect(401);
  });
  it('Restricted handles old unpaid obligations but cannot create; worker still expires after participants are disabled', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body;
    await db.setStatus(p.f.buyer.id, 'RESTRICTED');
    await create(p).expect(403);
    expect((await orderView(r.entityId, p.f.buyer)).canCancel).toBe(true);
    await cancel(r.entityId, p.f.buyer).expect(200);
    const p2 = await prepared(),
      r2 = (await create(p2).expect(200)).body;
    await db.setStatus(p2.f.buyer.id, 'LOCKED');
    await db.setStatus(p2.f.seller.id, 'DISABLED');
    await get(`/me/orders/${r2.entityId}`, p2.f.buyer).expect(200);
    const clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(r2.paymentDeadline));
    try {
      const expired = await app.get(OrdersService).expire(r2.entityId);
      expect(expired.receipt.state).toBe('PaymentExpired');
    } finally {
      clock.mockRestore();
    }
    expect((await stateCounts(p2.f.l.entityId)).active).toBe(0);
  });
  it.each(['origin', 'destination'] as const)(
    'rejects a quote after %s changes without orphan writes',
    async (side) => {
      const p = await prepared();
      await mutateAddress(
        side === 'origin' ? p.f.seller : p.f.buyer,
        p.f[side].id,
      );
      await create(p).expect(409);
      expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
    },
  );
  it.each([-1, 0, 1])(
    'checks quote deadline at offset %i using decision clock',
    async (offset) => {
      const p = await prepared(),
        q = (await db.c.sale_quotes.findOne({ _id: p.body.quoteId }))!;
      const clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(new Date(q.expiresAt.getTime() + offset));
      try {
        await create(p).expect(offset < 0 ? 200 : 409);
      } finally {
        clock.mockRestore();
      }
    },
  );
  it.each([-1, 0, 1])(
    'cancel vs expiry obeys payment boundary offset %i without local release',
    async (offset) => {
      const p = await prepared(),
        r = (await create(p).expect(200)).body;
      const clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(new Date(Date.parse(r.paymentDeadline) + offset));
      try {
        await cancel(r.entityId, p.f.buyer).expect(offset < 0 ? 200 : 409);
        if (offset >= 0) {
          expect((await orderView(r.entityId, p.f.buyer)).canCancel).toBe(
            false,
          );
          expect((await stateCounts(p.f.l.entityId)).active).toBe(1);
          await app.get(OrdersService).expire(r.entityId);
        }
        expect((await stateCounts(p.f.l.entityId)).active).toBe(0);
      } finally {
        clock.mockRestore();
      }
    },
  );
  it('100 simultaneous requests from five buyers produce exactly one winner under a real seller lock barrier', async () => {
    const p = await prepared(),
      preparedRequests = [p];
    for (let i = 0; i < 4; i++) {
      const buyer = await reader(),
        destination = await address(buyer);
      preparedRequests.push(
        await prepared({
          ...p.f,
          buyer,
          destination,
          body: { ...p.f.body, destinationAddressId: destination.id },
        }),
      );
    }
    const gate = await Gate.lockUser(db.client, p.f.seller.id);
    const calls = Array.from({ length: 100 }, (_, i) =>
      create(preparedRequests[i % 5]).then((r) => r),
    );
    try {
      await gate.contended(2);
      await gate.commit();
      const results = await Promise.all(calls);
      console.info(
        'Order stock race',
        Object.fromEntries(
          [200, 409, 429, 503].map((status) => [
            status,
            results.filter((r) => r.status === status).length,
          ]),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.every((r) => [200, 409, 503].includes(r.status))).toBe(
        true,
      );
      for (let i = 0; i < results.length; i++)
        if (results[i].status === 503)
          await create(preparedRequests[i % 5]).expect(409);
      expect(await stateCounts(p.f.l.entityId)).toEqual({
        orders: 1,
        items: 1,
        agreements: 1,
        active: 1,
        events: 1,
        receipts: 1,
        audits: 1,
        outbox: 1,
      });
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
  }, 120000);
  it('100 requests from one buyer cannot exceed two AwaitingPayment orders across three listings', async () => {
    const first = await prepared(),
      ps = [first];
    for (let i = 0; i < 2; i++) {
      const f = await setup();
      ps.push(
        await prepared({
          ...f,
          buyer: first.f.buyer,
          destination: first.f.destination,
          body: { ...f.body, destinationAddressId: first.f.destination.id },
        }),
      );
    }
    const gate = await Gate.lockUser(db.client, first.f.buyer.id),
      calls = Array.from({ length: 100 }, (_, i) =>
        create(ps[i % 3]).then((r) => r),
      );
    try {
      await gate.contended(2);
      await gate.commit();
      const results = await Promise.all(calls);
      console.info(
        'Order quota race',
        Object.fromEntries(
          [200, 409, 429, 503].map((status) => [
            status,
            results.filter((r) => r.status === status).length,
          ]),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(2);
      expect(
        results.every((r) => [200, 409, 429, 503].includes(r.status)),
      ).toBe(true);
      expect(
        await db.c.direct_orders.countDocuments({
          buyerId: first.f.buyer.id,
          state: 'AwaitingPayment',
        }),
      ).toBe(2);
      const winner = results.find((r) => r.status === 200)!.body;
      await cancel(winner.entityId, first.f.buyer).expect(200);
      const unused = ps.find(
        (p) =>
          !results.some(
            (r) =>
              r.status === 200 &&
              r.body.affectedListings[0].id === p.f.l.entityId,
          ),
      )!;
      await create(unused).expect(200);
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
  }, 120000);
  it('same-key contention has one durable receipt and one replay', async () => {
    const p = await prepared(),
      key = randomUUID(),
      gate = await Gate.lockUser(db.client, p.f.buyer.id);
    const calls = [
      create(p, key).then((r) => r),
      create(p, key).then((r) => r),
    ];
    try {
      await gate.contended(2);
      await gate.commit();
      const [a, b] = await Promise.all(calls);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body).toEqual(b.body);
      expect(
        [
          a.headers['idempotency-replayed'],
          b.headers['idempotency-replayed'],
        ].sort(),
      ).toEqual(['false', 'true']);
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
  });
  it.each(['role', 'hidden', 'address'] as const)(
    'rejects creation when %s mutation wins while waiting',
    async (kind) => {
      const p = await prepared(),
        gate = await Gate.lockUser(db.client, p.f.seller.id),
        response = create(p).then((r) => r);
      try {
        await gate.contended();
        const inGate = { session: gate.session };
        // Raw writes inside the lock holder's transaction, each following the
        // write protocol of its collection (content version +1, lockSeq bump).
        if (kind === 'role')
          await gate.db
            .collection<{ _id: string }>('users')
            .updateOne(
              { _id: p.f.seller.id },
              { $pull: { roles: { role: 'MEMBER' } } } as never,
              inGate,
            );
        else if (kind === 'hidden')
          await gate.db.collection<{ _id: string }>('listings').updateOne(
            { _id: p.f.l.entityId },
            {
              $set: { visibility: 'Hidden', updatedAt: new Date() },
              $inc: { version: 1, lockSeq: 1 },
            },
            inGate,
          );
        else
          await gate.db
            .collection<{ _id: string }>('member_addresses')
            .updateOne(
              { _id: p.f.origin.id },
              { $set: { detail: 'Updated source' }, $inc: { version: 1 } },
              inGate,
            );
        await gate.commit();
        expect((await response).status).toBe(409);
        expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
      } finally {
        await gate.close();
        await response;
      }
    },
  );
  it('creation wins before a competing lifecycle mutation, which cannot edit a reserved listing', async () => {
    const p = await prepared(),
      pause = pauseDecision(),
      retries = watchRetries(),
      first = create(p).then((r) => r);
    let second: Promise<request.Response> | undefined;
    try {
      await pause.reached;
      second = put(
        p.f.l.entityId,
        { expectedVersion: p.f.l.version, content: p.f.l.content },
        p.f.seller,
      ).then((r) => r);
      // The draft write contends for the seller lock the creation holds.
      await retries.until(1);
      pause.release();
      expect((await first).status).toBe(200);
      expect((await second).status).toBe(409);
    } finally {
      pause.release();
      retries.stop();
      pause.spy.mockRestore();
      await first;
      await second;
    }
  });
  it.each(['buyerRole', 'buyerRestricted', 'sessionRevoked'] as const)(
    'rechecks %s after HTTP authorization while waiting for locks',
    async (kind) => {
      const p = await prepared(),
        gate = await Gate.lockUser(db.client, p.f.buyer.id),
        call = create(p).then((r) => r);
      try {
        await gate.contended();
        const inGate = { session: gate.session };
        if (kind === 'buyerRole')
          await gate.db
            .collection<{ _id: string }>('users')
            .updateOne(
              { _id: p.f.buyer.id },
              { $pull: { roles: { role: 'MEMBER' } } } as never,
              inGate,
            );
        else if (kind === 'buyerRestricted')
          await gate.db
            .collection<{ _id: string }>('users')
            .updateOne(
              { _id: p.f.buyer.id },
              { $set: { status: 'RESTRICTED', updatedAt: new Date() } },
              inGate,
            );
        else
          await gate.db
            .collection<{ _id: string }>('auth_sessions')
            .updateOne(
              { _id: p.f.buyer.sessionId },
              { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
              inGate,
            );
        await gate.commit();
        expect((await call).status).toBe(kind === 'sessionRevoked' ? 401 : 403);
        expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
      } finally {
        await gate.close();
        await call;
      }
    },
  );
  it('session expiry after a listing lock wait prevents commit', async () => {
    const p = await prepared(),
      gate = await Gate.lock(db.client, 'listings', [p.f.l.entityId]),
      expiresAt = new Date(Date.now() + 60000);
    await setSession(p.f.buyer.sessionId, { expiresAt });
    const clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(expiresAt),
      response = create(p).then((r) => r);
    try {
      await gate.contended();
      expect(clock).not.toHaveBeenCalled();
      await gate.commit();
      expect((await response).status).toBe(401);
      expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
    } finally {
      await gate.close();
      await response;
      clock.mockRestore();
    }
  });
  it('two expiry commands serialize, survive restart and never release a later reservation', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body,
      gate = await Gate.lockUser(db.client, p.f.buyer.id);
    const clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(r.paymentDeadline));
    const calls = [
      app.get(OrdersService).expire(r.entityId),
      app.get(OrdersService).expire(r.entityId),
    ];
    let receipt: unknown;
    try {
      await gate.contended(2);
      await gate.commit();
      const results = await Promise.all(calls);
      expect(results[0].receipt).toEqual(results[1].receipt);
      receipt = results[0].receipt;
      expect((await stateCounts(p.f.l.entityId)).events).toBe(2);
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
      clock.mockRestore();
    }
    await app.close();
    app = await makeApp();
    expect((await app.get(OrdersService).expire(r.entityId)).receipt).toEqual(
      receipt,
    );
    const current = (await get(`/listings/${p.f.l.entityId}`).expect(200)).body;
    const next = await prepared({
      ...p.f,
      l: { ...p.f.l, version: current.version },
      body: { ...p.f.body, expectedListingVersion: current.version },
    });
    const newer = (await create(next).expect(200)).body;
    await app.get(OrdersService).expire(r.entityId);
    expect((await orderView(newer.entityId, p.f.buyer)).commitment.status).toBe(
      'Active',
    );
  });
  it('worker retries a rollback, reports overdue backlog, and resumes persisted work after restart', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body,
      deadline = new Date(Date.parse(r.paymentDeadline) + 121000);
    let clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(deadline);
    try {
      // Temporary validator rule (like the former failing SQL trigger).
      await db.withRejectingValidator(
        'audit_events',
        { action: 'expireOrder' },
        async () => {
          const result = await app.get(OrderExpiryWorker).tick();
          expect(result.failed).toBeGreaterThan(0);
          expect(result.oldestLagSeconds).toBeGreaterThanOrEqual(121);
          expect((await stateCounts(p.f.l.entityId)).active).toBe(1);
        },
      );
    } finally {
      clock.mockRestore();
    }
    await app.close();
    app = await makeApp();
    clock = vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(deadline);
    try {
      await app.get(OrderExpiryWorker).tick();
      expect((await stateCounts(p.f.l.entityId)).active).toBe(0);
      expect((await findOrder(r.entityId)).state).toBe('PaymentExpired');
    } finally {
      clock.mockRestore();
    }
  });
  it('rejects cross-context release, preserves visibility on closure and prevents Reserved without commitment', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body,
      c = (await db.c.exclusive_commitments.findOne({
        currentContextId: r.contextId,
      }))!;
    const p2 = await prepared(),
      r2 = (await create(p2).expect(200)).body;
    await expect(
      app
        .get(MongoService)
        .tx((tx) =>
          app
            .get(ReservationsService)
            .closeUnpaid(
              tx,
              r2.contextId,
              c._id,
              c.version,
              'Cancelled',
              new Date(),
              randomUUID(),
            ),
        ),
    ).rejects.toBeDefined();
    await db.c.listings.updateOne(
      { _id: p.f.l.entityId },
      {
        $set: { visibility: 'Hidden', updatedAt: new Date() },
        $inc: { version: 1, lockSeq: 1 },
      },
    );
    await cancel(r.entityId, p.f.buyer).expect(200);
    const l = (await db.c.listings.findOne({ _id: p.f.l.entityId }))!;
    expect(l.visibility).toBe('Hidden');
    expect(l.trade).toBe('Available');
    // The Reserved projection must match an Active commitment (C,
    // formerly the deferred latlai_check_commitment_projection).
    const trade = (id: string, to: 'Reserved' | 'Available') =>
      checked(
        (tx) =>
          tx.c.listings.updateOne(
            { _id: id },
            {
              $set: { trade: to, updatedAt: new Date() },
              $inc: { version: 1, lockSeq: 1 },
            },
          ),
        { listing: id },
      );
    await expect(trade(l._id, 'Reserved')).rejects.toThrow(
      'Listing/commitment projection mismatch',
    );
    await expect(trade(p2.f.l.entityId, 'Available')).rejects.toThrow(
      'Listing/commitment projection mismatch',
    );
    expect((await db.c.listings.findOne({ _id: l._id }))!.trade).toBe(
      'Available',
    );
    expect(
      (await db.c.listings.findOne({ _id: p2.f.l.entityId }))!.trade,
    ).toBe('Reserved');
    // Snapshots and commitment history are append-only for the app user (P).
    const appDb = app.get(MongoService).c;
    await expect(
      appDb.workflow_items.updateOne(
        { contextId: r.contextId },
        { $set: { snapshot: {} } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      appDb.agreement_snapshots.updateOne(
        { _id: r.contextId },
        { $set: { snapshot: { schemaVersion: 1 } } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      appDb.commitment_events.deleteMany({ commitmentId: c._id }),
    ).rejects.toMatchObject({ code: 13 });
    // A released commitment cannot be revived (W filters state; C rejects).
    await expect(
      checked(
        (tx) =>
          tx.c.exclusive_commitments.updateOne(
            { _id: c._id },
            {
              $set: {
                status: 'Active',
                version: 1,
                endedAt: null,
                reason: null,
              },
            },
          ),
        { order: r.entityId },
      ),
    ).rejects.toThrow('Order commitment mismatch');
    expect(
      (await db.c.exclusive_commitments.findOne({ _id: c._id }))!.status,
    ).toBe('Released');
  });
  it.each([
    'workflow_items',
    'agreement_snapshots',
    'exclusive_commitments',
    'commitment_events',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ] as const)(
    'rolls back all Order effects when %s fails and retries once',
    async (collection) => {
      const p = await prepared(),
        key = randomUUID();
      // Temporary validator rule rejecting every write (like the former
      // failing BEFORE INSERT trigger on the table).
      await db.withRejectingValidator(
        collection,
        { _id: { $exists: true } },
        async () => {
          await create(p, key).expect(500);
          expect(await stateCounts(p.f.l.entityId)).toEqual({
            orders: 0,
            items: 0,
            agreements: 0,
            active: 0,
            events: 0,
            receipts: 0,
            audits: 0,
            outbox: 0,
          });
          expect(
            (await db.c.listings.findOne({ _id: p.f.l.entityId }))!.trade,
          ).toBe('Available');
        },
      );
      const r = (await create(p, key).expect(200)).body;
      expect((await create(p, key).expect(200)).body).toEqual(r);
    },
  );
  it('a fresh worker process expires persisted work and a second process does not duplicate effects', async () => {
    const f = await setup(),
      past = new Date(Date.now() - 20 * 60 * 1000);
    const quoteClock = vi
      .spyOn(app.get(QuoteClock), 'now')
      .mockResolvedValue(past);
    const orderClock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(past.getTime() + 1000));
    let orderId: string;
    try {
      const p = await prepared(f);
      orderId = (await create(p).expect(200)).body.entityId;
    } finally {
      quoteClock.mockRestore();
      orderClock.mockRestore();
    }
    const run = (
      args = ['.tmp/order-worker-test/test/helpers/order-worker-child.js'],
    ) =>
      new Promise<void>((resolve, reject) => {
        // The child connects with MONGODB_URL (the least-privilege app user
        // on this run's dedicated *_test database) inherited from test-env.
        const child = spawn(process.execPath, args, {
          env: {
            ...process.env,
            ORDER_WORKER_TEST: '1',
            SUPABASE_URL: '',
            SUPABASE_STORAGE_KEY: '',
          },
          windowsHide: true,
          stdio: 'ignore',
        });
        child.once('error', () =>
          reject(new Error('Worker test process could not start')),
        );
        child.once('exit', (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`Worker test process exited ${code}`)),
        );
      });
    // The TypeScript compiler preserves Nest constructor metadata; a lightweight
    // transpiler alone is not a valid production worker startup check.
    await run([
      createRequire(import.meta.url).resolve('typescript/bin/tsc'),
      '-p',
      'test/helpers/tsconfig.worker.json',
    ]);
    await run();
    expect((await findOrder(orderId!)).state).toBe('PaymentExpired');
    const before = await stateCounts(f.l.entityId);
    await run();
    expect(await stateCounts(f.l.entityId)).toEqual(before);
    expect(before.events).toBe(2);
  }, 60000);
  it.each(['cancel', 'expiry'] as const)(
    'serializes cancel/timeout with %s winning and exactly one release',
    async (winner) => {
      const p = await prepared(),
        r = (await create(p).expect(200)).body;
      const t = Date.parse(r.paymentDeadline),
        pause = pauseDecision(new Date(winner === 'cancel' ? t - 1 : t));
      pause.spy.mockResolvedValue(new Date(t));
      const retries = watchRetries();
      const cancelCall = () =>
        cancel(r.entityId, p.f.buyer).then((value) => ({
          status: value.status,
        }));
      const expiryCall = () =>
        app
          .get(OrdersService)
          .expire(r.entityId)
          .then(
            () => ({ status: 200 }),
            () => ({ status: 409 }),
          );
      const first = winner === 'cancel' ? cancelCall() : expiryCall();
      let second: Promise<{ status: number }> | undefined;
      try {
        await pause.reached;
        second = winner === 'cancel' ? expiryCall() : cancelCall();
        // The loser contends for the participant locks the winner holds.
        await retries.until(1);
        pause.release();
        expect((await first).status).toBe(200);
        expect((await second).status).toBe(409);
        const o = await findOrder(r.entityId);
        expect(o.state).toBe(
          winner === 'cancel' ? 'Cancelled' : 'PaymentExpired',
        );
        expect(await stateCounts(p.f.l.entityId)).toEqual({
          orders: 1,
          items: 1,
          agreements: 1,
          active: 0,
          events: 2,
          receipts: 2,
          audits: 2,
          outbox: 2,
        });
      } finally {
        pause.release();
        retries.stop();
        await first;
        await second;
        pause.spy.mockRestore();
      }
    },
  );
  it('blocks all lifecycle writes on a real reservation even at the current listing version', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body,
      version = r.affectedListings[0].version,
      id = p.f.l.entityId;
    await post(
      `/listings/${id}/revision`,
      {
        expectedVersion: version,
        content: p.f.l.content,
        ownershipDeclared: true,
      },
      p.f.seller,
    ).expect(409);
    await request(app.getHttpServer())
      .put(`/api/v1/listings/${id}/visibility`)
      .set('Authorization', `Bearer ${p.f.seller.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: version, visibility: 'Hidden' })
      .expect(409);
    await post(
      `/listings/${id}/archive`,
      { expectedVersion: version },
      p.f.seller,
    ).expect(409);
    await post(
      `/operations/listings/${id}/remove`,
      { expectedVersion: version, reason: 'Nội dung kiểm thử bị gỡ.' },
      staff,
    ).expect(409);
    expect((await db.c.listings.findOne({ _id: id }))!.trade).toBe('Reserved');
  });
  it('rejects orphan Orders, incomplete context cardinality and duplicate active commitments at the commit boundary', async () => {
    const p = await prepared(),
      q = (await db.c.sale_quotes.findOne({ _id: p.body.quoteId }))!,
      now = new Date();
    const order = (): DirectOrderDoc => ({
      _id: randomUUID(),
      buyerId: q.buyerId,
      sellerId: q.sellerId,
      quoteId: q._id,
      version: 1,
      state: 'AwaitingPayment',
      createdAt: now,
      paymentDeadline: new Date(now.getTime() + 900000),
      closedAt: null,
      paidAt: null,
      sellerConfirmationDeadline: null,
      cancellationRequestedAt: null,
      cancellationReason: null,
      lockSeq: 0,
    });
    const orphan = order();
    await expect(
      checked((tx) => tx.c.direct_orders.insertOne(orphan), {
        order: orphan._id,
      }),
    ).rejects.toThrow('Order/context/quote mismatch');
    const bare = order();
    await expect(
      checked(
        async (tx) => {
          await tx.c.direct_orders.insertOne(bare);
          await tx.c.workflow_contexts.insertOne({
            _id: randomUUID(),
            kind: 'Order',
            orderId: bare._id,
            auctionIntakeId: null,
            version: 1,
            ownershipPhase: 'Holding',
            lockSeq: 0,
          });
        },
        { order: bare._id },
      ),
    ).rejects.toThrow('Order/context/quote mismatch');
    expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
    expect(await db.c.direct_orders.countDocuments({ quoteId: q._id })).toBe(0);
    const r = (await create(p).expect(200)).body,
      c = (await db.c.exclusive_commitments.findOne({
        currentContextId: r.contextId,
      }))!;
    const appDb = app.get(MongoService).c;
    // One Active commitment per listing (partial unique index, I).
    await expect(
      appDb.exclusive_commitments.insertOne({ ...c, _id: randomUUID() }),
    ).rejects.toMatchObject({ code: 11000 });
    // A context never changes its Order (W; C rejects at commit).
    await expect(
      checked(
        (tx) =>
          tx.c.workflow_contexts.updateOne(
            { _id: r.contextId },
            { $set: { orderId: randomUUID() } },
          ),
        { order: r.entityId },
      ),
    ).rejects.toThrow('Order/context/quote mismatch');
    // Only the known system principals may write system receipts (V).
    await expect(
      appDb.mutation_receipts.insertOne({
        _id: randomUUID(),
        principal: 'system:FakeWorker',
        actorId: null,
        systemActor: 'FakeWorker' as never,
        operation: 'expireOrder',
        key: randomUUID(),
        payloadHash: 'f'.repeat(64),
        listingId: null,
        bookId: null,
        mediaId: null,
        addressBookId: null,
        quoteId: null,
        contextId: r.contextId,
        topupId: null,
        resultVersion: 1,
        result: {},
        committedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 121 });
    expect(
      (await db.c.workflow_contexts.findOne({ _id: r.contextId }))!.orderId,
    ).toBe(r.entityId);
  });
  it('rolls back snapshot and commitment if the listing projection write fails', async () => {
    const p = await prepared(),
      key = randomUUID();
    await db.withRejectingValidator(
      'listings',
      { _id: p.f.l.entityId, trade: 'Reserved' },
      async () => {
        await create(p, key).expect(500);
        expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
      },
    );
    await create(p, key).expect(200);
  });
  it('LOCKED participants recover orders/media and buyer cancellation without new-action or operations access', async () => {
    const p = await prepared(),
      key = randomUUID(),
      r = (await create(p, key).expect(200)).body;
    await db.addRole(p.f.buyer.id, 'ADMIN');
    for (const id of [p.f.buyer.id, p.f.seller.id])
      await db.setStatus(id, 'LOCKED');
    for (const actor of [p.f.buyer, p.f.seller]) {
      const page = (await get('/me/orders', actor).expect(200)).body;
      validates('MyOrderPage', page);
      expect(page.items.some((o: { id: string }) => o.id === r.entityId)).toBe(
        true,
      );
      const view = await orderView(r.entityId, actor);
      expect(view.canCancel).toBe(actor.id === p.f.buyer.id);
      await get(
        `/me/orders/${r.entityId}/media/${p.f.l.image.id}/read`,
        actor,
      ).expect(200);
      await get('/me/listings', actor).expect(403);
      await get('/operations/listings', actor).expect(403);
    }
    await create(p, key).expect(403); // Existing create receipt does not bypass current lock.
    await cancel(r.entityId, p.f.seller).expect(404);
    const outsider = await reader(['MEMBER'], 'LOCKED');
    await get(`/me/orders/${r.entityId}`, outsider).expect(404);
    await get(
      `/me/orders/${r.entityId}/media/${p.f.l.image.id}/read`,
      outsider,
    ).expect(404);
    await get(`/me/orders?cursor=${r.entityId}`, outsider).expect(404);
    await cancel(r.entityId, outsider).expect(404);
    const cancelKey = randomUUID(),
      receipt = (await cancel(r.entityId, p.f.buyer, cancelKey).expect(200))
        .body;
    expect(
      (await cancel(r.entityId, p.f.buyer, cancelKey).expect(200)).body,
    ).toEqual(receipt);
    expect((await orderView(r.entityId, p.f.buyer)).state).toBe('Cancelled');
    await db.removeRole(p.f.buyer.id, 'MEMBER');
    await get(`/me/orders/${r.entityId}`, p.f.buyer).expect(403);
    await cancel(r.entityId, p.f.buyer, cancelKey).expect(403);
  });
  it('recovers owned Order history with stable keysets and state filters', async () => {
    const p = await prepared(),
      first = (await create(p).expect(200)).body;
    await cancel(first.entityId, p.f.buyer).expect(200);
    const next = await prepared(await setup(250000, 'Sale', p.f.buyer));
    const second = (await create(next).expect(200)).body;
    const page = (await get('/me/orders?limit=1', p.f.buyer).expect(200)).body;
    expect(page.items[0].id).toBe(second.entityId);
    const tail = (
      await get(
        '/me/orders?limit=1&cursor=' + page.nextCursor,
        p.f.buyer,
      ).expect(200)
    ).body;
    expect(tail.items[0].id).toBe(first.entityId);
    expect(tail.nextCursor).toBeNull();
    expect(
      (
        await get('/me/orders?state=Cancelled', p.f.buyer).expect(200)
      ).body.items.map((o: { id: string }) => o.id),
    ).toEqual([first.entityId]);
    await get('/me/orders?ownerId=' + p.f.seller.id, p.f.buyer).expect(400);
  });
  it('rechecks LOCKED access after waiting and still enforces cancellation deadline', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body,
      gate = await Gate.lockUser(db.client, p.f.buyer.id);
    const call = cancel(r.entityId, p.f.buyer).then((v) => v.status);
    try {
      await gate.contended();
      await gate.db
        .collection<{ _id: string }>('users')
        .updateOne(
          { _id: p.f.buyer.id },
          { $set: { status: 'LOCKED', updatedAt: new Date() } },
          { session: gate.session },
        );
      await gate.commit();
    } finally {
      await gate.close();
    }
    expect(await call).toBe(200);
    const late = await prepared(),
      lr = (await create(late).expect(200)).body;
    await db.setStatus(late.f.buyer.id, 'LOCKED');
    const clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(lr.paymentDeadline));
    try {
      await cancel(lr.entityId, late.f.buyer).expect(409);
      expect((await orderView(lr.entityId, late.f.buyer)).canCancel).toBe(
        false,
      );
    } finally {
      clock.mockRestore();
    }
  });
  it.each(['LOCKED', 'DISABLED'] as const)(
    'rechecks %s after provider signing without leaking unauthorized media',
    async (status) => {
      const p = await prepared(),
        r = (await create(p).expect(200)).body;
      storage.beforeSign = async () => {
        await db.setStatus(p.f.buyer.id, status);
      };
      try {
        await get(
          `/me/orders/${r.entityId}/media/${p.f.l.image.id}/read`,
          p.f.buyer,
        ).expect(status === 'LOCKED' ? 200 : 401);
      } finally {
        storage.beforeSign = undefined;
      }
    },
  );
  it('rechecks participant session after storage signing without holding database locks across provider calls', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body;
    storage.beforeSign = async () => {
      await setSession(p.f.buyer.sessionId, { revokedAt: new Date() });
    };
    try {
      await get(
        `/me/orders/${r.entityId}/media/${p.f.l.image.id}/read`,
        p.f.buyer,
      ).expect(401);
    } finally {
      storage.beforeSign = undefined;
    }
  });
});
