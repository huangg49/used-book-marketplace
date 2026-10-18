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
import type {
  LedgerJournalDoc,
  RoleCode,
  UserStatus,
} from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import {
  onTransactionRetry,
  TransactionBusyError,
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

describe('Order wallet payment and pre-confirmation refund HTTP and MongoDB', () => {
  let app: INestApplication, db: MongoFixtures;
  const users: string[] = [];
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
    // closes per request, which can reset connections of the staggered 503
    // retries in the 100-request race.
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
  // while it holds the user/listing/order (and ledger) locks. PostgreSQL
  // granted queued row locks in FIFO order; MongoDB aborts and retries the
  // loser, so the intended winner is made explicit by holding it here.
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
  // Under contention MongoDB answers 503 "retry the same request" once the
  // retry budget is exhausted (ADR 0027). A 503 is accepted only when the same
  // request (same idempotency key) is then retried to its final outcome.
  async function settle(send: () => PromiseLike<request.Response>) {
    for (let attempt = 1; ; attempt++) {
      const r = await send();
      if (r.status !== 503 || attempt === 10) return r;
    }
  }
  // Same for the internal workers: their key is the Order id.
  async function settleWorker<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof TransactionBusyError) || attempt === 10) throw e;
      }
    }
  }
  // A raw write through the application's own connection that must pass the
  // commit-time Order checks (C) every command registers, the equivalent of
  // the deferred PostgreSQL constraint triggers.
  const checked = (fn: (tx: Tx) => Promise<unknown>, orderId: string) =>
    app.get(MongoService).tx(async (tx) => {
      await fn(tx);
      tx.check(`order:${orderId}`, () => checkOrder(tx, orderId));
    });

  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    db = await MongoFixtures.connect();
    app = await makeApp();
    m1 = await reader();
    operator = await reader(['TEST_OPERATOR']);
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
      const topups = (
        await c.topup_intents.find({ ownerId: { $in: users } }).toArray()
      ).map((t) => t._id);
      // Removing this suite's order and topup journals together returns the
      // drained simulator funds to the shared source (capital is conserved).
      const journals = (
        await c.ledger_journals
          .find({
            $or: [{ orderId: { $in: orders } }, { topupId: { $in: topups } }],
          })
          .toArray()
      ).map((j) => j._id);
      const accounts = (
        await c.wallet_accounts
          .find({
            $or: [{ ownerId: { $in: users } }, { orderId: { $in: orders } }],
          })
          .toArray()
      ).map((a) => a._id);
      await c.ledger_entries.deleteMany({ journalId: { $in: journals } });
      await c.ledger_journals.deleteMany({ _id: { $in: journals } });
      await c.simulated_payment_events.deleteMany({
        intentId: { $in: topups },
      });
      await c.topup_intents.deleteMany({ _id: { $in: topups } });
      await c.account_locks.deleteMany({ _id: { $in: accounts } });
      await c.wallet_accounts.deleteMany({ _id: { $in: accounts } });
      await c.commitment_events.deleteMany({
        commitmentId: { $in: commitments },
      });
      await c.exclusive_commitments.deleteMany({ _id: { $in: commitments } });
      await c.agreement_snapshots.deleteMany({ _id: { $in: contexts } });
      await c.workflow_items.deleteMany({ contextId: { $in: contexts } });
      await c.workflow_contexts.deleteMany({ _id: { $in: contexts } });
      await c.order_preparations.deleteMany({ _id: { $in: orders } });
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
      await c.member_notifications.deleteMany({ userId: { $in: users } });
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
      ...(await prepareSellerOrder(app, f.buyer, {
        quoteId: q.entityId,
        expectedQuoteVersion: 1,
        expectedListingVersion: f.l.version,
        expectedListingRevisionId: f.l.revisionId,
      })),
    };
  }
  const create = (
    p: Awaited<ReturnType<typeof prepared>>,
    key = randomUUID(),
    actor = p.f.seller,
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
  const journals = (
    orderId: string | { $in: string[] },
    type?: LedgerJournalDoc['type'],
  ) =>
    db.c.ledger_journals.countDocuments({ orderId, ...(type ? { type } : {}) });
  const holdAccounts = (orderId: string) =>
    db.c.wallet_accounts.countDocuments({ orderId });
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
  const reject = (f: PaymentFixture, actor = f.f.seller, key = randomUUID()) =>
    post(`/orders/${f.id}/reject`, { expectedVersion: 2 }, actor, key);
  const wallet = async (actor: Reader) => {
    const r = await get('/me/wallet', actor).expect(200);
    validates('WalletSummary', r.body);
    return r.body;
  };
  // One snapshot transaction, like the former REPEATABLE READ reconciliation.
  const reconcile = () =>
    app.get(MongoService).tx((tx) => app.get(LedgerService).reconcile(tx));

  it('moves full frozen P+S exactly once into a typed hold, keeps reservation and private contacts, with 48h deadline', async () => {
    const f = await ready(),
      before = await stateCounts(f.f.l.entityId),
      key = randomUUID();
    await expectAvailability(f.f.l.entityId, 'AwaitingPayment');
    const paid = (await pay(f, key).expect(200)).body;
    await expectAvailability(f.f.l.entityId, 'InTransaction');
    validates('TransactionCommandReceipt', paid);
    expect(paid).toMatchObject({
      state: 'PendingSellerConfirmation',
      version: 2,
      affectedListings: [],
    });
    const view = await orderView(f.id, f.f.buyer),
      seller = await orderView(f.id, f.f.seller),
      total = view.amounts.buyerTotal;
    expect(
      new Date(view.sellerConfirmationDeadline).getTime() -
        new Date(view.paidAt).getTime(),
    ).toBe(48 * 3600000);
    expect(view).toMatchObject({
      moneyHeld: total,
      refundedAmount: 0,
      paymentEnabled: false,
      canRequestRefund: true,
      sellerAcceptanceEnabled: false,
    });
    expect(seller.canReject).toBe(true);
    expect(JSON.stringify(seller)).not.toContain(f.f.buyer.id + '"'); // buyer's contact detail is never exposed
    expect(await wallet(f.f.buyer)).toMatchObject({
      available: 500000 - total,
      transactionHeld: total,
      total: 500000,
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
    const replay = await pay(f, key).expect(200);
    expect(replay.body).toEqual(paid);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await pay(f).expect(409);
    await cancel(f.id, f.f.buyer).expect(409);
    expect(await journals(f.id)).toBe(1);
    const audit = (await db.c.audit_events.findOne({ receiptId: paid.id }))!;
    expect(audit.action).toBe('payOrder');
    expect((await reconcile()).balanced).toBe(true);
  });
  it('insufficient available leaves no hold account/journal/receipt; independent topup allows same-key retry', async () => {
    const f = await ready(1000),
      key = randomUUID(),
      before = await stateCounts(f.f.l.entityId);
    await pay(f, key).expect(409);
    expect(await holdAccounts(f.id)).toBe(0);
    expect(await stateCounts(f.f.l.entityId)).toEqual(before);
    expect((await wallet(f.f.buyer)).available).toBe(1000);
    await fund(f.f.buyer, 300000);
    await pay(f, key).expect(200);
    expect((await orderView(f.id, f.f.buyer)).paymentDeadline).toBe(
      f.r.paymentDeadline,
    );
  });
  it('records cancellation before refund, keeps hold/reservation, then completes refund and releases once after restart', async () => {
    const f = await ready(),
      paymentKey = randomUUID();
    const payment = (await pay(f, paymentKey).expect(200)).body;
    const key = randomUUID(),
      decision = (await cancelPaid(f, key).expect(200)).body;
    validates('TransactionCommandReceipt', decision);
    expect(decision.state).toBe('SettlementPending');
    expect(await orderView(f.id, f.f.buyer)).toMatchObject({
      cancellationReason: 'BuyerCancelled',
      refundedAmount: 0,
      commitment: { status: 'Active' },
    });
    expect((await wallet(f.f.buyer)).transactionHeld).toBeGreaterThan(0);
    await app.close();
    app = await makeApp();
    const refund = await app.get(OrdersService).refund(f.id);
    expect(refund.receipt).toMatchObject({ state: 'Cancelled', version: 4 });
    expect(await wallet(f.f.buyer)).toMatchObject({
      available: 500000,
      transactionHeld: 0,
      total: 500000,
    });
    const view = await orderView(f.id, f.f.buyer);
    expect(view).toMatchObject({
      state: 'Cancelled',
      moneyHeld: 0,
      refundedAmount: view.amounts.buyerTotal,
      commitment: { status: 'Released', version: 2 },
    });
    expect((await app.get(OrdersService).refund(f.id)).receipt).toEqual(
      refund.receipt,
    );
    expect((await pay(f, paymentKey).expect(200)).body).toEqual(payment);
    expect((await cancelPaid(f, key).expect(200)).body).toEqual(decision);
    const history = (await get('/me/wallet/history', f.f.buyer).expect(200))
      .body;
    validates('WalletHistoryPage', history);
    expect(history.items.map((i: any) => i.type)).toEqual([
      'OrderRefund',
      'OrderPayment',
      'Topup',
    ]);
    expect(history.items.map((i: any) => i.balanceAfter)).toEqual([
      500000,
      500000 - view.amounts.buyerTotal,
      500000,
    ]);
    const filtered = (
      await get(
        '/me/wallet/history?type=OrderPayment&orderId=' + f.id,
        f.f.buyer,
      ).expect(200)
    ).body;
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].amount).toBe(-view.amounts.buyerTotal);
    const page = (
      await get(
        '/me/wallet/history?limit=1&cursor=' + history.items[0].journalId,
        f.f.buyer,
      ).expect(200)
    ).body;
    expect(page.items[0]).toEqual(history.items[1]);
    await get(
      '/me/wallet/history?cursor=' + history.items[0].journalId,
      f.f.seller,
    ).expect(404);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('seller may reject only their own paid order; LOCKED participants can request/refund obligations', async () => {
    const f = await ready();
    await pay(f).expect(200);
    await reject(f, f.f.buyer).expect(404);
    await cancelPaid(f, randomUUID(), f.f.seller).expect(404);
    await db.setStatus(f.f.seller.id, 'LOCKED');
    await reject(f).expect(200);
    expect((await orderView(f.id, f.f.seller)).cancellationReason).toBe(
      'SellerRejected',
    );
    await db.setStatus(f.f.buyer.id, 'DISABLED');
    await app.get(OrdersService).refund(f.id);
    expect((await findOrder(f.id)).state).toBe('Cancelled');
    const other = await ready();
    await pay(other).expect(200);
    await db.setStatus(other.f.buyer.id, 'LOCKED');
    const key = randomUUID();
    await cancelPaid(other, key).expect(200);
    await cancelPaid(other, key).expect(200);
    expect((await wallet(other.f.buyer)).paymentsEnabled).toBe(false);
    await app.get(OrdersService).refund(other.id);
  });
  it.each([
    'foreign',
    'seller',
    'locked',
    'disabled',
    'revoked',
    'role',
    'unverified',
    'sellerLocked',
  ] as const)('denies payment for %s without writes', async (kind) => {
    const f = await ready();
    let actor = f.f.buyer;
    let status = 403;
    if (kind === 'foreign') {
      actor = await reader();
      status = 404;
    }
    if (kind === 'seller') {
      actor = f.f.seller;
      status = 404;
    }
    if (kind === 'locked' || kind === 'disabled') {
      await db.setStatus(actor.id, kind === 'locked' ? 'LOCKED' : 'DISABLED');
      status = kind === 'locked' ? 403 : 401;
    }
    if (kind === 'unverified') {
      await setUser([actor.id], { emailVerifiedAt: null });
      status = 401;
    }
    if (kind === 'revoked') {
      await setSession(actor.sessionId, { revokedAt: new Date() });
      status = 401;
    }
    if (kind === 'role') await setUser([actor.id], { roles: [] });
    if (kind === 'sellerLocked') await db.setStatus(f.f.seller.id, 'LOCKED');
    await pay(f, randomUUID(), actor).expect(status);
    expect(await journals(f.id)).toBe(0);
    expect(await holdAccounts(f.id)).toBe(0);
  });
  it('restricted buyer/seller can fund an existing order; guest, wrong version, extra amounts and reused key are rejected', async () => {
    const f = await ready();
    await request(app.getHttpServer())
      .post('/api/v1/orders/' + f.id + '/pay')
      .send({ expectedVersion: 1 })
      .expect(401);
    await pay(f, randomUUID(), f.f.buyer, 9).expect(409);
    await post(
      '/orders/' + f.id + '/pay',
      { expectedVersion: 1, amount: 1 },
      f.f.buyer,
    ).expect(422);
    await setUser([f.f.buyer.id, f.f.seller.id], { status: 'RESTRICTED' });
    const key = randomUUID();
    await pay(f, key).expect(200);
    await pay(f, key, f.f.buyer, 2).expect(409);
  });
  it.each([-1, 0, 1])(
    'payment deadline offset %i is decided after ledger locks',
    async (offset) => {
      const f = await ready(),
        now = new Date(new Date(f.r.paymentDeadline).getTime() + offset);
      const clock = vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(now);
      try {
        await pay(f).expect(offset < 0 ? 200 : 409);
      } finally {
        clock.mockRestore();
      }
      expect(await journals(f.id)).toBe(offset < 0 ? 1 : 0);
    },
  );
  it.each([
    'paymentDeadline',
    'sessionDeadline',
    'lockBuyer',
    'lockSeller',
  ] as const)(
    'waiting payment rechecks %s at a verified DB barrier',
    async (kind) => {
      const f = await ready(),
        target = kind === 'lockSeller' ? f.f.seller.id : f.f.buyer.id,
        gate = await Gate.lockUser(db.client, target);
      const clock = vi.spyOn(app.get(OrderClock), 'now');
      const pending = pay(f).then((r) => r);
      try {
        await gate.contended();
        expect(clock).not.toHaveBeenCalled();
        // Changes commit together with the lock holder, like the statements
        // issued on the blocking PostgreSQL connection.
        const inGate = { session: gate.session };
        if (kind === 'paymentDeadline')
          clock.mockResolvedValue(new Date(f.r.paymentDeadline));
        else if (kind === 'sessionDeadline') {
          const deadline = new Date(Date.now() + 30000);
          await gate.db
            .collection<{ _id: string }>('auth_sessions')
            .updateOne(
              { _id: f.f.buyer.sessionId },
              { $set: { expiresAt: deadline }, $inc: { lockSeq: 1 } },
              inGate,
            );
          clock.mockResolvedValue(deadline);
        } else
          await gate.db
            .collection<{ _id: string }>('users')
            .updateOne(
              { _id: target },
              { $set: { status: 'LOCKED', updatedAt: new Date() } },
              inGate,
            );
        await gate.commit();
        expect((await pending).status).toBe(
          kind === 'paymentDeadline'
            ? 409
            : kind === 'sessionDeadline'
              ? 401
              : 403,
        );
        expect(await journals(f.id)).toBe(0);
      } finally {
        await gate.close();
        await pending;
        clock.mockRestore();
      }
    },
  );
  it.each(['pay', 'cancel'] as const)(
    '%s wins against the other unpaid command under a DB barrier',
    async (first) => {
      const f = await ready(),
        payKey = randomUUID(),
        cancelKey = randomUUID();
      const a = () => settle(() => pay(f, payKey)),
        b = () => settle(() => cancel(f.id, f.f.buyer, cancelKey));
      const pause = pauseDecision(),
        retries = watchRetries(),
        one = first === 'pay' ? a() : b();
      let two: ReturnType<typeof a> | undefined;
      try {
        await pause.reached;
        two = first === 'pay' ? b() : a();
        // The loser contends for the participant locks the winner holds.
        await retries.until(1);
        pause.release();
        expect((await one).status).toBe(200);
        expect((await two).status).toBe(409);
        expect(await journals(f.id)).toBe(first === 'pay' ? 1 : 0);
      } finally {
        pause.release();
        retries.stop();
        await one;
        await two;
        pause.spy.mockRestore();
      }
    },
  );
  it('payment before deadline beats stale expiry; expiry at deadline beats payment and late topup never reopens order', async () => {
    const f = await ready(),
      t = Date.parse(f.r.paymentDeadline),
      pause = pauseDecision(new Date(t - 1));
    pause.spy.mockResolvedValue(new Date(t - 1));
    const retries = watchRetries(),
      payKey = randomUUID();
    const paid = settle(() => pay(f, payKey));
    let expired: Promise<unknown> | undefined;
    try {
      await pause.reached;
      expired = settleWorker(() => app.get(OrdersService).expire(f.id)).catch(
        (e) => e,
      );
      await retries.until(1);
      pause.release();
      expect((await paid).status).toBe(200);
      expect(await expired).toHaveProperty('status', 409);
    } finally {
      pause.release();
      retries.stop();
      await paid;
      await expired;
      pause.spy.mockRestore();
    }
    const g = await ready(),
      tg = Date.parse(g.r.paymentDeadline),
      pause2 = pauseDecision(new Date(tg));
    pause2.spy.mockResolvedValue(new Date(tg));
    const retries2 = watchRetries(),
      key2 = randomUUID();
    const first = settleWorker(() => app.get(OrdersService).expire(g.id));
    let second: Promise<request.Response> | undefined;
    try {
      await pause2.reached;
      second = settle(() => pay(g, key2));
      await retries2.until(1);
      pause2.release();
      expect((await first).receipt.state).toBe('PaymentExpired');
      expect((await second).status).toBe(409);
    } finally {
      pause2.release();
      retries2.stop();
      await first;
      await second;
      pause2.spy.mockRestore();
    }
    await fund(g.f.buyer, 1000);
    await pay(g).expect(409);
    expect(await journals(g.id)).toBe(0);
  });
  it('two orders cannot spend the same available money; concurrent same-key pay posts one journal', async () => {
    const f = await ready(250000),
      g = await ready(0, await setup(200000, 'Sale', f.f.buyer)),
      key = randomUUID(),
      otherKey = randomUUID();
    // PostgreSQL queued all three on the buyer row lock and granted it in
    // arrival order; here the first payment is held inside its transaction
    // while the other two provably contend, then released.
    const pause = pauseDecision(),
      retries = watchRetries();
    const calls = [settle(() => pay(f, key))];
    try {
      await pause.reached;
      calls.push(
        settle(() => pay(f, key)),
        settle(() => pay(g, otherKey)),
      );
      await retries.until(2);
      pause.release();
      const results = await Promise.all(calls);
      expect(results[0].status).toBe(200);
      expect(results[1].status).toBe(200);
      expect(results[1].body).toEqual(results[0].body);
      expect(results[2].status).toBe(409);
      expect((await wallet(f.f.buyer)).available).toBeGreaterThanOrEqual(0);
      expect(await journals({ $in: [f.id, g.id] })).toBe(1);
    } finally {
      pause.release();
      retries.stop();
      await Promise.allSettled(calls);
      pause.spy.mockRestore();
    }
  });
  it.each([-1, 0, 1])(
    'confirmation deadline offset %i controls rejection versus expiry and full refund',
    async (offset) => {
      const f = await ready();
      await pay(f).expect(200);
      const o = await findOrder(f.id);
      // Worker has no session dependency. Keep test member session valid for the HTTP edge test.
      await setSession(f.f.seller.sessionId, {
        expiresAt: new Date(o.sellerConfirmationDeadline!.getTime() + 3600000),
      });
      const clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(
          new Date(o.sellerConfirmationDeadline!.getTime() + offset),
        );
      try {
        await reject(f).expect(offset < 0 ? 200 : 409);
        if (offset >= 0) {
          const results = await Promise.all([
            settleWorker(() => app.get(OrdersService).expireConfirmation(f.id)),
            settleWorker(() => app.get(OrdersService).expireConfirmation(f.id)),
          ]);
          expect(results[0].receipt).toEqual(results[1].receipt);
        }
        await app.get(OrdersService).refund(f.id);
      } finally {
        clock.mockRestore();
      }
      expect(await wallet(f.f.buyer)).toMatchObject({
        available: 500000,
        transactionHeld: 0,
      });
      expect(await journals(f.id, 'OrderRefund')).toBe(1);
    },
  );
  it.each([
    'ledger_entries',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ] as const)(
    'payment failure at %s rolls back every effect, same key can retry',
    async (collection) => {
      const f = await ready(),
        key = randomUUID(),
        before = await stateCounts(f.f.l.entityId);
      // Temporary validator rule rejecting every insert (the former failing
      // BEFORE INSERT trigger on the table).
      await db.withRejectingValidator(
        collection,
        { _id: { $exists: true } },
        () => pay(f, key).expect(500),
      );
      expect(await stateCounts(f.f.l.entityId)).toEqual(before);
      expect((await wallet(f.f.buyer)).available).toBe(500000);
      expect(await holdAccounts(f.id)).toBe(0);
      await pay(f, key).expect(200);
    },
  );
  it('refund failure leaves durable SettlementPending, holds stock/money and worker retries once after restart', async () => {
    const f = await ready();
    await pay(f).expect(200);
    await cancelPaid(f).expect(200);
    await db.withRejectingValidator(
      'ledger_journals',
      { type: 'OrderRefund' },
      async () => {
        const result = await app.get(OrderExpiryWorker).tick();
        expect(result.failed).toBeGreaterThan(0);
        expect(result.refundRemaining).toBeGreaterThan(0);
        expect(await orderView(f.id, f.f.buyer)).toMatchObject({
          state: 'SettlementPending',
          refundedAmount: 0,
          commitment: { status: 'Active' },
        });
      },
    );
    await app.close();
    app = await makeApp();
    const gate = await Gate.lockUser(db.client, f.f.buyer.id),
      calls = [
        settleWorker(() => app.get(OrdersService).refund(f.id)),
        settleWorker(() => app.get(OrdersService).refund(f.id)),
      ];
    try {
      await gate.contended(2);
      await gate.commit();
      const results = await Promise.all(calls);
      expect(results[0].receipt).toEqual(results[1].receipt);
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
    expect(await wallet(f.f.buyer)).toMatchObject({
      available: 500000,
      transactionHeld: 0,
    });
    expect((await stateCounts(f.f.l.entityId)).events).toBe(2);
  });
  it('raw writes cannot pay without a journal, forge refund decision, release funded stock or mutate journal/hold history', async () => {
    const f = await ready();
    // Cross-document rules are commit-time checks (C): a raw write in the
    // application's transaction that registers them is aborted.
    await expect(
      checked(async (tx) => {
        const now = await tx.now();
        await tx.c.direct_orders.updateOne(
          { _id: f.id },
          {
            $set: {
              state: 'PendingSellerConfirmation',
              paidAt: now,
              sellerConfirmationDeadline: new Date(
                now.getTime() + 48 * 3600000,
              ),
            },
            $inc: { version: 1 },
          },
        );
      }, f.id),
    ).rejects.toThrow('Order funding/hold projection mismatch');
    await pay(f).expect(200);
    await expect(
      checked(async (tx) => {
        await tx.c.direct_orders.updateOne(
          { _id: f.id },
          {
            $set: {
              state: 'SettlementPending',
              cancellationRequestedAt: await tx.now(),
              cancellationReason: 'BuyerCancelled',
            },
            $inc: { version: 1 },
          },
        );
      }, f.id),
    ).rejects.toThrow('Missing authorized refund decision');
    await expect(
      checked(async (tx) => {
        await tx.c.exclusive_commitments.updateOne(
          { currentContextId: f.r.contextId },
          {
            $set: {
              status: 'Released',
              version: 2,
              endedAt: await tx.now(),
              reason: 'Cancelled',
            },
          },
        );
      }, f.id),
    ).rejects.toThrow('Order commitment mismatch');
    // Hold accounts and posted money are append-only for the app user (P).
    const appDb = app.get(MongoService).c;
    await expect(
      appDb.wallet_accounts.updateOne(
        { orderId: f.id },
        { $set: { orderId: null } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    const journal = (await db.c.ledger_journals.findOne({ orderId: f.id }))!;
    await expect(
      appDb.ledger_entries.updateMany(
        { journalId: journal._id },
        { $inc: { debit: 1 } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      appDb.ledger_journals.deleteMany({ orderId: f.id }),
    ).rejects.toMatchObject({ code: 13 });
    expect(await findOrder(f.id)).toMatchObject({
      state: 'PendingSellerConfirmation',
      version: 2,
    });
    expect(await holdAccounts(f.id)).toBe(1);
    expect(await journals(f.id)).toBe(1);
    expect((await reconcile()).balanced).toBe(true);
  });
  it.each(['cancel', 'reject'] as const)(
    '%s wins the paid cancellation race, with one durable decision',
    async (first) => {
      const f = await ready();
      await pay(f).expect(200);
      const cancelKey = randomUUID(),
        rejectKey = randomUUID();
      const a = () => settle(() => cancelPaid(f, cancelKey)),
        b = () => settle(() => reject(f, f.f.seller, rejectKey));
      const pause = pauseDecision(),
        retries = watchRetries(),
        one = first === 'cancel' ? a() : b();
      let two: ReturnType<typeof a> | undefined;
      try {
        await pause.reached;
        two = first === 'cancel' ? b() : a();
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
      const view = await orderView(f.id, f.f.buyer);
      expect(view.cancellationReason).toBe(
        first === 'cancel' ? 'BuyerCancelled' : 'SellerRejected',
      );
      await app.get(OrdersService).refund(f.id);
      expect((await stateCounts(f.f.l.entityId)).receipts).toBe(4);
    },
  );
  it('100 concurrent payment requests with one key have one economic effect and identical receipts', async () => {
    const f = await ready(),
      gate = await Gate.lockUser(db.client, f.f.buyer.id),
      key = randomUUID();
    // PostgreSQL queued all 100 on the row lock. MongoDB aborts and retries
    // within a 5 s budget and answers 503 "retry the same request" when it is
    // exhausted; a client that does exactly that must end with 100 identical
    // receipts.
    let calls: Promise<request.Response>[] = [];
    try {
      calls = Array.from({ length: 100 }, () => settle(() => pay(f, key)));
      await gate.contended(10);
      await gate.commit();
      const results = await Promise.all(calls);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await journals(f.id, 'OrderPayment')).toBe(1);
    } finally {
      await gate.close();
      await Promise.allSettled(calls);
    }
  }, 120000);
  it.each(['wrongRecipient', 'wrongAmount'] as const)(
    'database rejects %s even if a service produces balanced payment entries',
    async (kind) => {
      const f = await ready(),
        ledger = app.get(LedgerService),
        original = ledger.postOrder.bind(ledger);
      const foreign = await reader();
      await fund(foreign, 1000);
      const account = (await db.c.wallet_accounts.findOne({
        ownerId: foreign.id,
      }))!;
      // A faulty service still writes through the ledger's journal writer
      // (write protocol W), whose commit-time journal check (C, formerly the
      // deferred latlai_check_journal trigger) must reject it.
      const writeJournal = (
        ledger as unknown as {
          journal: (
            tx: Tx,
            fields: Omit<LedgerJournalDoc, '_id' | 'sequence'>,
            from: string,
            to: string,
            amount: number,
          ) => Promise<LedgerJournalDoc>;
        }
      ).journal.bind(ledger);
      const mock = vi
        .spyOn(ledger, 'postOrder')
        .mockImplementation(
          async (tx, id, receipt, accounts, amount, now, refund) => {
            if (kind === 'wrongAmount')
              return original(
                tx,
                id,
                receipt,
                accounts,
                amount - 1,
                now,
                refund,
              );
            return writeJournal(
              tx,
              {
                type: 'OrderPayment',
                topupId: null,
                eventId: null,
                orderId: id,
                receiptId: receipt,
                postedAt: now,
              },
              account._id,
              accounts.hold,
              amount,
            );
          },
        );
      try {
        await pay(f).expect(500);
      } finally {
        mock.mockRestore();
      }
      expect(await journals(f.id)).toBe(0);
      expect((await wallet(f.f.buyer)).available).toBe(500000);
      expect((await wallet(foreign)).available).toBe(1000);
    },
  );
  it.each([
    'ledger_entries',
    'exclusive_commitments',
    'direct_orders',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ] as const)(
    'refund failure at %s preserves the prior decision and is retryable',
    async (collection) => {
      const f = await ready();
      await pay(f).expect(200);
      await cancelPaid(f).expect(200);
      const before = await stateCounts(f.f.l.entityId);
      // Temporary validator rule (the former failing trigger): inserts are
      // rejected outright; for the two updated collections only the refund's
      // closing update is rejected (BEFORE UPDATE; lock writes are not
      // updates in PostgreSQL).
      const rule =
        collection === 'exclusive_commitments'
          ? { status: 'Released' }
          : collection === 'direct_orders'
            ? { state: 'Cancelled' }
            : { _id: { $exists: true } };
      await db.withRejectingValidator(collection, rule, () =>
        expect(app.get(OrdersService).refund(f.id)).rejects.toMatchObject({
          code: 121,
        }),
      );
      expect(await stateCounts(f.f.l.entityId)).toEqual(before);
      expect(await journals(f.id)).toBe(1);
      expect((await orderView(f.id, f.f.buyer)).state).toBe(
        'SettlementPending',
      );
      await app.get(OrdersService).refund(f.id);
      expect((await wallet(f.f.buyer)).available).toBe(500000);
    },
  );
  async function instant() {
    const f = await setup();
    const q = (await quote(f).expect(200)).body;
    const body = {
      quoteId: q.entityId,
      expectedQuoteVersion: 1,
      expectedListingVersion: f.l.version,
      expectedListingRevisionId: f.l.revisionId,
    };
    return { f, body };
  }
  async function expectAvailability(listingId: string, status: string) {
    const listing = (await get(`/listings/${listingId}`).expect(200)).body;
    validates('PublicListing', listing);
    expect(listing.purchaseAvailability.status).toBe(status);
    return listing.purchaseAvailability;
  }
  it('buy-now freezes listed price without chat; payment commits preparation and notifications once', async () => {
    const p = await instant(),
      key = randomUUID();
    const created = await post(
      '/orders/buy-now',
      p.body,
      p.f.buyer,
      key,
    ).expect(200);
    validates('TransactionCommandReceipt', created.body);
    const id = created.body.entityId;
    expect(await expectAvailability(p.f.l.entityId, 'AwaitingPayment'))
      .toEqual({ status: 'AwaitingPayment', expiresAt: created.body.paymentDeadline });
    expect(
      await db.c.purchase_conversations.countDocuments({
        listingId: p.f.l.entityId,
      }),
    ).toBe(0);
    expect((await orderView(id, p.f.buyer)).amounts.bookPrice).toBe(200000);
    expect(
      (await post('/orders/buy-now', p.body, p.f.buyer, key).expect(200)).body,
    ).toEqual(created.body);
    await post(
      '/orders/buy-now',
      { ...p.body, expectedListingVersion: p.body.expectedListingVersion + 1 },
      p.f.buyer,
      key,
    ).expect(409);
    await post(`/orders/${id}/pay`, { expectedVersion: 1 }, p.f.buyer).expect(
      409,
    );
    expect(await holdAccounts(id)).toBe(0);
    await expectAvailability(p.f.l.entityId, 'AwaitingPayment');
    await fund(p.f.buyer);
    const payKey = randomUUID();
    const paid = await post(
      `/orders/${id}/pay`,
      { expectedVersion: 1 },
      p.f.buyer,
      payKey,
    ).expect(200);
    expect(paid.body).toMatchObject({ state: 'Preparing', version: 3 });
    expect(await expectAvailability(p.f.l.entityId, 'InTransaction'))
      .toEqual({ status: 'InTransaction', expiresAt: null });
    const buyer = await orderView(id, p.f.buyer),
      seller = await orderView(id, p.f.seller);
    expect(buyer.purchaseMode).toBe('BuyNow');
    expect(buyer.moneyHeld).toBe(230000);
    expect(buyer.sellerConfirmationDeadline).toBeNull();
    expect(seller.sellerAcceptanceEnabled).toBe(false);
    expect(seller.shipmentRegistrationEnabled).toBe(false); // Ready packaging evidence is still required.
    expect(seller.shippingAddress).toBeTruthy();
    expect(
      Date.parse(seller.preparation.pickupDeadline) - Date.parse(buyer.paidAt),
    ).toBe(48 * 3600000);
    expect(
      (
        await post(
          `/orders/${id}/pay`,
          { expectedVersion: 1 },
          p.f.buyer,
          payKey,
        ).expect(200)
      ).body,
    ).toEqual(paid.body);
    expect(await journals(id, 'OrderPayment')).toBe(1);
    await expectAvailability(p.f.l.entityId, 'InTransaction');
    expect(
      await db.c.member_notifications.countDocuments({
        targetId: id,
        kind: 'OrderBuyNowPaid',
      }),
    ).toBe(2);
    await post(
      `/orders/${id}/accept`,
      { expectedVersion: 3 },
      p.f.seller,
    ).expect(409);
    await post(
      `/orders/${id}/reject`,
      { expectedVersion: 3 },
      p.f.seller,
    ).expect(409);
    await post(
      `/orders/${id}/cancel-paid`,
      { expectedVersion: 3 },
      p.f.buyer,
    ).expect(409);
    await app.get(MongoService).tx((tx) => checkOrder(tx, id));
    // Current authorization is checked before replaying an already paid command.
    await setUser([p.f.buyer.id], { status: 'LOCKED' });
    await post(
      `/orders/${id}/pay`,
      { expectedVersion: 1 },
      p.f.buyer,
      payKey,
    ).expect(403);
    await setUser([p.f.buyer.id], { status: 'ACTIVE' });
  }, 60000);
  it('buy-now rejects foreign quotes, stale addresses, altered prices and ineligible buyers without reservation', async () => {
    const p = await instant();
    await post('/orders/buy-now', p.body, p.f.seller).expect(404);
    await post(
      '/orders/buy-now',
      { ...p.body, agreedBookPrice: 10000 },
      p.f.buyer,
    ).expect(422);
    await setUser([p.f.buyer.id], { status: 'RESTRICTED' });
    await post('/orders/buy-now', p.body, p.f.buyer).expect(403);
    await setUser([p.f.buyer.id], { status: 'ACTIVE' });
    await db.c.member_addresses.updateOne(
      { _id: p.f.destination.id },
      { $inc: { version: 1 }, $set: { detail: 'Updated QA-only destination' } },
    );
    await post('/orders/buy-now', p.body, p.f.buyer).expect(409);
    expect((await stateCounts(p.f.l.entityId)).active).toBe(0);
  }, 60000);
  it('buy-now and negotiated checkout race for exactly one listing commitment', async () => {
    const p = await instant();
    const negotiated = await prepareSellerOrder(app, p.f.buyer, p.body, 180000);
    const results = await Promise.all([
      post('/orders/buy-now', p.body, p.f.buyer),
      post('/orders', negotiated.body, p.f.seller),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => [409, 422].includes(r.status))).toHaveLength(
      1,
    );
    expect((await stateCounts(p.f.l.entityId)).orders).toBe(1);
    expect((await stateCounts(p.f.l.entityId)).active).toBe(1);
  }, 60000);
  it('buy-now unpaid cancellation releases only its reservation and charges nothing', async () => {
    const p = await instant();
    const created = await post('/orders/buy-now', p.body, p.f.buyer).expect(
      200,
    );
    const id = created.body.entityId;
    await cancel(id, p.f.buyer).expect(200);
    await expectAvailability(p.f.l.entityId, 'Available');
    expect((await db.c.listings.findOne({ _id: p.f.l.entityId }))!.trade).toBe(
      'Available',
    );
    expect(await journals(id)).toBe(0);
    expect(
      await db.c.member_notifications.countDocuments({ targetId: id }),
    ).toBe(0);
  }, 60000);
  it('buy-now payment rollback preserves unpaid order and leaves no hold, preparation or notices', async () => {
    const p = await instant();
    const created = await post('/orders/buy-now', p.body, p.f.buyer).expect(
      200,
    );
    const id = created.body.entityId;
    await fund(p.f.buyer);
    const service = app.get(OrdersService),
      original = service.transition.bind(service);
    const mock = vi
      .spyOn(service, 'transition')
      .mockImplementation(async (tx, order, set) => {
        const result = await original(tx, order, set);
        if (set.state === 'Preparing')
          throw new Error('QA injected preparation failure');
        return result;
      });
    const key = randomUUID();
    try {
      await post(
        `/orders/${id}/pay`,
        { expectedVersion: 1 },
        p.f.buyer,
        key,
      ).expect(500);
    } finally {
      mock.mockRestore();
    }
    expect((await orderView(id, p.f.buyer)).state).toBe('AwaitingPayment');
    await expectAvailability(p.f.l.entityId, 'AwaitingPayment');
    expect(await holdAccounts(id)).toBe(0);
    expect(await journals(id)).toBe(0);
    expect(await db.c.order_preparations.countDocuments({ _id: id })).toBe(0);
    expect(
      await db.c.member_notifications.countDocuments({ targetId: id }),
    ).toBe(0);
    const result = await post(
      `/orders/${id}/pay`,
      { expectedVersion: 1 },
      p.f.buyer,
      key,
    ).expect(200);
    expect(result.body.state).toBe('Preparing');
    await expectAvailability(p.f.l.entityId, 'InTransaction');
  }, 60000);
  it('buy-now payment at the deadline fails and expiry releases the unpaid book once', async () => {
    const p = await instant();
    const created = await post('/orders/buy-now', p.body, p.f.buyer).expect(
      200,
    );
    const id = created.body.entityId;
    await fund(p.f.buyer);
    const clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(created.body.paymentDeadline));
    try {
      await post(`/orders/${id}/pay`, { expectedVersion: 1 }, p.f.buyer).expect(
        409,
      );
      await app.get(OrdersService).expire(id);
      await app.get(OrdersService).expire(id);
      expect((await orderView(id, p.f.buyer)).state).toBe('PaymentExpired');
      await expectAvailability(p.f.l.entityId, 'Available');
      expect(
        (await db.c.listings.findOne({ _id: p.f.l.entityId }))!.trade,
      ).toBe('Available');
      expect(await journals(id)).toBe(0);
    } finally {
      clock.mockRestore();
    }
  }, 60000);
});
