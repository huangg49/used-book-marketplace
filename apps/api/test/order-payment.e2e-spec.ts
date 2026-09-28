import { OrderClock } from '../src/modules/orders/order-clock.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';

import { OrdersService } from '../src/modules/orders/orders.service.js';
import { OrderExpiryWorker } from '../src/modules/orders/order-expiry.service.js';

import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { RoleCode, UserStatus } from '../src/generated/prisma/client.js';
import { DatabaseService } from '../src/database/database.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import request from 'supertest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { hash } from 'argon2';
import { MediaStorage } from '../src/modules/media/media-storage.js';

// Storage signing is deliberately faked. HTTP, authorization and PostgreSQL are real.
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

const contract = parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      '@used-books/api-contract/openapi.yaml',
    ),
    'utf8',
  ),
);
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);
ajv.addSchema({ $id: 'api-wire', components: contract.components });
function validates(name: string, body: unknown) {
  const fn = ajv.compile({ $ref: `api-wire#/components/schemas/${name}` });
  expect(fn(body), JSON.stringify(fn.errors)).toBe(true);
}
type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
type Pool = ReturnType<Adapter['underlyingDriver']>;
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

describe('Order wallet payment and pre-confirmation refund HTTP and PostgreSQL', () => {
  const schema = `payment_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
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
    const id = randomUUID(),
      sessionId = randomUUID(),
      email = `${id}@draft-http.test`;
    await db.user.create({
      data: {
        id,
        emailNormalized: email,
        displayName: 'Bạn đọc thử nghiệm',
        passwordHash: await hash('Only-a-test-password-2026'),
        status,
        emailVerifiedAt: new Date(),
        roles: { create: roles.map((role) => ({ role })) },
        sessions: {
          create: {
            id: sessionId,
            refreshTokenHash: randomBytes(32).toString('hex'),
            expiresAt: new Date(Date.now() + 86400000),
          },
        },
      },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: id, sid: sessionId });
    return { id, sessionId, token, email };
  }
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
      .overrideProvider(DatabaseService)
      .useValue(db)
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    const next = module.createNestApplication();
    next
      .get(ConfigService)
      .set('PAYMENT_SIMULATOR_SECRET', process.env.PAYMENT_SIMULATOR_SECRET);
    configureApp(next, { docs: false, logRequests: false });
    await next.init();
    return next;
  }
  async function blockedBy(
    pid: number,
    minimum = 1,
    observer: Pick<Pool, 'query'> = pool,
  ) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      // A barrier connection stays in one transaction: refresh PostgreSQL's
      // statistics snapshot so newly opened contenders are visible.
      await observer.query('SELECT pg_stat_clear_snapshot()');
      const r = await observer.query(
        'SELECT count(*)::int n FROM pg_stat_activity a WHERE $1 = ANY(pg_blocking_pids(a.pid)) OR EXISTS (SELECT 1 FROM pg_stat_activity b WHERE $1 = ANY(pg_blocking_pids(b.pid)) AND b.pid = ANY(pg_blocking_pids(a.pid)))',
        [pid],
      );
      if (r.rows[0].n >= minimum) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      'HTTP mutation never reached the blocked database transaction',
    );
  }
  async function blockUser(id: string) {
    const connection = await pool.connect();
    await connection.query('BEGIN');
    await connection.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [id]);
    const pid = (await connection.query('SELECT pg_backend_pid() pid')).rows[0]
      .pid as number;
    return { connection, pid };
  }

  beforeAll(async () => {
    process.env.PAYMENT_SIMULATOR_SECRET = randomBytes(32).toString('hex');
    const url = process.env.TEST_DATABASE_URL!;
    if (!decodeURIComponent(new URL(url).pathname).endsWith('_test'))
      throw new Error('Only _test databases');
    adapter = await new PrismaPg({
      connectionString: url,
      max: 16,
      options: `-c search_path=${schema},public -c timezone=UTC`,
      statement_timeout: 15000,
    }).connect();
    pool = adapter.underlyingDriver();
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const name of readdirSync('prisma/migrations')
      .filter((n) => /^\d/.test(n))
      .sort())
      await pool.query(
        readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'),
      );
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    await db.$connect();
    app = await makeApp();
    m1 = await reader();
    operator = await reader(['TEST_OPERATOR']);
    a1 = await reader(['MEMBER', 'ADMIN']);
    a2 = await reader(['ADMIN']);
    staff = await reader(['STAFF']);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool && /^payment_http_test_[a-f0-9]{32}$/.test(schema))
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adapter?.dispose();
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
    const key = randomUUID();
    // Fixture derivative only: not proof of upload/Sharp/live-provider behavior.
    return db.listingMedia.create({
      data: {
        listingId,
        status,
        stagingKey: key,
        pinnedKey: status === 'Ready' ? key + '/input' : null,
        derivativeKey: status === 'Ready' ? key + '/display.webp' : null,
        mimeType: 'image/jpeg',
        byteSize: 100,
        sha256: 'a'.repeat(64),
        width: status === 'Ready' ? 20 : null,
        height: status === 'Ready' ? 20 : null,
        reservedBytes: 1000,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
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
  const cancel = (id: string, actor: Reader, key = randomUUID(), version = 1) =>
    post(`/orders/${id}/cancel`, { expectedVersion: version }, actor, key);
  async function orderView(id: string, actor: Reader) {
    const r = await get(`/me/orders/${id}`, actor).expect(200);
    validates('PrivateUnpaidOrder', r.body);
    expect(r.headers['cache-control']).toContain('no-store');
    return r.body;
  }
  async function stateCounts(listingId: string) {
    const contexts = await db.workflowContext.findMany({
        where: { items: { some: { listingId } } },
        select: { id: true },
      }),
      ids = contexts.map((c) => c.id);
    return {
      orders: await db.directOrder.count({
        where: { context: { id: { in: ids } } },
      }),
      items: await db.workflowItem.count({ where: { contextId: { in: ids } } }),
      agreements: await db.agreementSnapshot.count({
        where: { contextId: { in: ids } },
      }),
      active: await db.exclusiveCommitment.count({
        where: { listingId, status: 'Active' },
      }),
      events: await db.commitmentEvent.count({
        where: { commitment: { listingId } },
      }),
      receipts: await db.mutationReceipt.count({
        where: { contextId: { in: ids } },
      }),
      audits: await db.auditEvent.count({ where: { contextId: { in: ids } } }),
      outbox: await db.outboxEvent.count({
        where: { audit: { contextId: { in: ids } } },
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
    db.$transaction((tx) => app.get(LedgerService).reconcile(tx), {
      isolationLevel: 'RepeatableRead',
    });

  it('moves full frozen P+S exactly once into a typed hold, keeps reservation and private contacts, with 48h deadline', async () => {
    const f = await ready(),
      before = await stateCounts(f.f.l.entityId),
      key = randomUUID();
    const paid = (await pay(f, key).expect(200)).body;
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
      (await db.listing.findUniqueOrThrow({ where: { id: f.f.l.entityId } }))
        .version,
    ).toBe(f.f.l.version + 1);
    const replay = await pay(f, key).expect(200);
    expect(replay.body).toEqual(paid);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await pay(f).expect(409);
    await cancel(f.id, f.f.buyer).expect(409);
    expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(1);
    const audit = await db.auditEvent.findUniqueOrThrow({
      where: { receiptId: paid.id },
    });
    expect(audit.action).toBe('payOrder');
    expect((await reconcile()).balanced).toBe(true);
  });
  it('insufficient available leaves no hold account/journal/receipt; independent topup allows same-key retry', async () => {
    const f = await ready(1000),
      key = randomUUID(),
      before = await stateCounts(f.f.l.entityId);
    await pay(f, key).expect(409);
    expect(await db.walletAccount.count({ where: { orderId: f.id } })).toBe(0);
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
    await db.user.update({
      where: { id: f.f.seller.id },
      data: { status: 'LOCKED' },
    });
    await reject(f).expect(200);
    expect((await orderView(f.id, f.f.seller)).cancellationReason).toBe(
      'SellerRejected',
    );
    await db.user.update({
      where: { id: f.f.buyer.id },
      data: { status: 'DISABLED' },
    });
    await app.get(OrdersService).refund(f.id);
    expect(
      (await db.directOrder.findUniqueOrThrow({ where: { id: f.id } })).state,
    ).toBe('Cancelled');
    const other = await ready();
    await pay(other).expect(200);
    await db.user.update({
      where: { id: other.f.buyer.id },
      data: { status: 'LOCKED' },
    });
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
      await db.user.update({
        where: { id: actor.id },
        data: { status: kind === 'locked' ? 'LOCKED' : 'DISABLED' },
      });
      status = kind === 'locked' ? 403 : 401;
    }
    if (kind === 'unverified') {
      await db.user.update({
        where: { id: actor.id },
        data: { emailVerifiedAt: null },
      });
      status = 401;
    }
    if (kind === 'revoked') {
      await db.authSession.update({
        where: { id: actor.sessionId },
        data: { revokedAt: new Date() },
      });
      status = 401;
    }
    if (kind === 'role')
      await db.userRole.deleteMany({ where: { userId: actor.id } });
    if (kind === 'sellerLocked')
      await db.user.update({
        where: { id: f.f.seller.id },
        data: { status: 'LOCKED' },
      });
    await pay(f, randomUUID(), actor).expect(status);
    expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(0);
    expect(await db.walletAccount.count({ where: { orderId: f.id } })).toBe(0);
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
    await db.user.updateMany({
      where: { id: { in: [f.f.buyer.id, f.f.seller.id] } },
      data: { status: 'RESTRICTED' },
    });
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
      expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(
        offset < 0 ? 1 : 0,
      );
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
        gate = await blockUser(
          kind === 'lockSeller' ? f.f.seller.id : f.f.buyer.id,
        );
      const clock = vi.spyOn(app.get(OrderClock), 'now');
      const pending = pay(f).then((r) => r);
      try {
        await blockedBy(gate.pid, 1, gate.connection);
        expect(clock).not.toHaveBeenCalled();
        if (kind === 'paymentDeadline')
          clock.mockResolvedValue(new Date(f.r.paymentDeadline));
        else if (kind === 'sessionDeadline') {
          const deadline = new Date(Date.now() + 30000);
          await gate.connection.query(
            'UPDATE auth_sessions SET expires_at=$1 WHERE id=$2',
            [deadline, f.f.buyer.sessionId],
          );
          clock.mockResolvedValue(deadline);
        } else
          await gate.connection.query(
            "UPDATE users SET status='LOCKED' WHERE id=$1",
            [kind === 'lockSeller' ? f.f.seller.id : f.f.buyer.id],
          );
        await gate.connection.query('COMMIT');
        expect((await pending).status).toBe(
          kind === 'paymentDeadline'
            ? 409
            : kind === 'sessionDeadline'
              ? 401
              : 403,
        );
        expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(
          0,
        );
      } finally {
        await gate.connection.query('ROLLBACK');
        gate.connection.release();
        await pending;
        clock.mockRestore();
      }
    },
  );
  it.each(['pay', 'cancel'] as const)(
    '%s wins against the other unpaid command under a DB barrier',
    async (first) => {
      const f = await ready(),
        gate = await blockUser(f.f.buyer.id);
      const a = () => pay(f).then((r) => r),
        b = () => cancel(f.id, f.f.buyer).then((r) => r);
      const one = first === 'pay' ? a() : b();
      let two: ReturnType<typeof a> | undefined;
      try {
        await blockedBy(gate.pid, 1, gate.connection);
        two = first === 'pay' ? b() : a();
        await blockedBy(gate.pid, 2, gate.connection);
        await gate.connection.query('COMMIT');
        expect((await one).status).toBe(200);
        expect((await two).status).toBe(409);
        expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(
          first === 'pay' ? 1 : 0,
        );
      } finally {
        await gate.connection.query('ROLLBACK');
        gate.connection.release();
        await one;
        await two;
      }
    },
  );
  it('payment before deadline beats stale expiry; expiry at deadline beats payment and late topup never reopens order', async () => {
    const f = await ready(),
      gate = await blockUser(f.f.buyer.id),
      clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(
          new Date(new Date(f.r.paymentDeadline).getTime() - 1),
        );
    const paid = pay(f).then((r) => r);
    let expired: Promise<unknown> | undefined;
    try {
      await blockedBy(gate.pid, 1, gate.connection);
      expired = app
        .get(OrdersService)
        .expire(f.id)
        .catch((e) => e);
      await blockedBy(gate.pid, 2, gate.connection);
      await gate.connection.query('COMMIT');
      expect((await paid).status).toBe(200);
      expect(await expired).toHaveProperty('status', 409);
    } finally {
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await paid;
      await expired;
      clock.mockRestore();
    }
    const g = await ready(),
      gate2 = await blockUser(g.f.buyer.id),
      clock2 = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(new Date(g.r.paymentDeadline));
    const first = app.get(OrdersService).expire(g.id);
    let second: Promise<any> | undefined;
    try {
      await blockedBy(gate2.pid, 1, gate2.connection);
      second = pay(g).then((r) => r);
      await blockedBy(gate2.pid, 2, gate2.connection);
      await gate2.connection.query('COMMIT');
      expect((await first).receipt.state).toBe('PaymentExpired');
      expect((await second).status).toBe(409);
    } finally {
      await gate2.connection.query('ROLLBACK');
      gate2.connection.release();
      await first;
      await second;
      clock2.mockRestore();
    }
    await fund(g.f.buyer, 1000);
    await pay(g).expect(409);
    expect(await db.ledgerJournal.count({ where: { orderId: g.id } })).toBe(0);
  });
  it('two orders cannot spend the same available money; concurrent same-key pay posts one journal', async () => {
    const f = await ready(250000),
      g = await ready(0, await setup(200000, 'Sale', f.f.buyer)),
      gate = await blockUser(f.f.buyer.id),
      key = randomUUID();
    const calls = [
      pay(f, key).then((r) => r),
      pay(f, key).then((r) => r),
      pay(g).then((r) => r),
    ];
    try {
      await blockedBy(gate.pid, 3, gate.connection);
      await gate.connection.query('COMMIT');
      const results = await Promise.all(calls);
      expect(results[0].status).toBe(200);
      expect(results[1].body).toEqual(results[0].body);
      expect(results[2].status).toBe(409);
      expect((await wallet(f.f.buyer)).available).toBeGreaterThanOrEqual(0);
      expect(
        await db.ledgerJournal.count({
          where: { orderId: { in: [f.id, g.id] } },
        }),
      ).toBe(1);
    } finally {
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
    }
  });
  it.each([-1, 0, 1])(
    'confirmation deadline offset %i controls rejection versus expiry and full refund',
    async (offset) => {
      const f = await ready();
      await pay(f).expect(200);
      const o = await db.directOrder.findUniqueOrThrow({ where: { id: f.id } });
      // Worker has no session dependency. Keep test member session valid for the HTTP edge test.
      await db.authSession.update({
        where: { id: f.f.seller.sessionId },
        data: {
          expiresAt: new Date(
            o.sellerConfirmationDeadline!.getTime() + 3600000,
          ),
        },
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
            app.get(OrdersService).expireConfirmation(f.id),
            app.get(OrdersService).expireConfirmation(f.id),
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
      expect(
        await db.ledgerJournal.count({
          where: { orderId: f.id, type: 'OrderRefund' },
        }),
      ).toBe(1);
    },
  );
  it.each([
    'ledger_entries',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ] as const)(
    'payment failure at %s rolls back every effect, same key can retry',
    async (table) => {
      const f = await ready(),
        key = randomUUID(),
        before = await stateCounts(f.f.l.entityId);
      await pool.query(
        `CREATE FUNCTION fail_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failpoint'; END $$; CREATE TRIGGER fail_payment BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_payment()`,
      );
      try {
        await pay(f, key).expect(500);
      } finally {
        await pool.query(
          `DROP TRIGGER fail_payment ON ${table}; DROP FUNCTION fail_payment()`,
        );
      }
      expect(await stateCounts(f.f.l.entityId)).toEqual(before);
      expect((await wallet(f.f.buyer)).available).toBe(500000);
      expect(await db.walletAccount.count({ where: { orderId: f.id } })).toBe(
        0,
      );
      await pay(f, key).expect(200);
    },
  );
  it('refund failure leaves durable SettlementPending, holds stock/money and worker retries once after restart', async () => {
    const f = await ready();
    await pay(f).expect(200);
    await cancelPaid(f).expect(200);
    await pool.query(
      `CREATE FUNCTION fail_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='OrderRefund' THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_refund BEFORE INSERT ON ledger_journals FOR EACH ROW EXECUTE FUNCTION fail_refund()`,
    );
    try {
      const result = await app.get(OrderExpiryWorker).tick();
      expect(result.failed).toBeGreaterThan(0);
      expect(result.refundRemaining).toBeGreaterThan(0);
      expect(await orderView(f.id, f.f.buyer)).toMatchObject({
        state: 'SettlementPending',
        refundedAmount: 0,
        commitment: { status: 'Active' },
      });
    } finally {
      await pool.query(
        'DROP TRIGGER fail_refund ON ledger_journals; DROP FUNCTION fail_refund()',
      );
    }
    await app.close();
    app = await makeApp();
    const gate = await blockUser(f.f.buyer.id),
      calls = [
        app.get(OrdersService).refund(f.id),
        app.get(OrdersService).refund(f.id),
      ];
    try {
      await blockedBy(gate.pid, 2, gate.connection);
      await gate.connection.query('COMMIT');
      const results = await Promise.all(calls);
      expect(results[0].receipt).toEqual(results[1].receipt);
    } finally {
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
    }
    expect(await wallet(f.f.buyer)).toMatchObject({
      available: 500000,
      transactionHeld: 0,
    });
    expect((await stateCounts(f.f.l.entityId)).events).toBe(2);
  });
  it('raw SQL cannot pay without a journal, forge refund decision, release funded stock or mutate journal/hold history', async () => {
    const f = await ready();
    await expect(
      pool.query(
        "UPDATE direct_orders SET state='PendingSellerConfirmation',version=2,paid_at=statement_timestamp(),seller_confirmation_deadline=statement_timestamp()+interval '48 hours' WHERE id=$1",
        [f.id],
      ),
    ).rejects.toThrow('Order funding/hold projection mismatch');
    await pay(f).expect(200);
    await expect(
      pool.query(
        "UPDATE direct_orders SET state='SettlementPending',version=3,cancellation_requested_at=clock_timestamp(),cancellation_reason='BuyerCancelled' WHERE id=$1",
        [f.id],
      ),
    ).rejects.toBeDefined();
    await expect(
      pool.query(
        "UPDATE exclusive_commitments SET status='Released',version=2,ended_at=clock_timestamp(),reason='Cancelled' WHERE current_context_id=$1",
        [f.r.contextId],
      ),
    ).rejects.toBeDefined();
    await expect(
      pool.query('UPDATE wallet_accounts SET order_id=NULL WHERE order_id=$1', [
        f.id,
      ]),
    ).rejects.toBeDefined();
    await expect(
      pool.query(
        'UPDATE ledger_entries SET debit=debit+1 WHERE journal_id IN (SELECT id FROM ledger_journals WHERE order_id=$1)',
        [f.id],
      ),
    ).rejects.toBeDefined();
    await expect(
      pool.query('DELETE FROM ledger_journals WHERE order_id=$1', [f.id]),
    ).rejects.toBeDefined();
    expect((await reconcile()).balanced).toBe(true);
  });
  it.each(['cancel', 'reject'] as const)(
    '%s wins the paid cancellation race, with one durable decision',
    async (first) => {
      const f = await ready();
      await pay(f).expect(200);
      const gate = await blockUser(f.f.buyer.id);
      const a = () => cancelPaid(f).then((r) => r),
        b = () => reject(f).then((r) => r);
      const one = first === 'cancel' ? a() : b();
      let two: ReturnType<typeof a> | undefined;
      try {
        await blockedBy(gate.pid, 1, gate.connection);
        two = first === 'cancel' ? b() : a();
        await blockedBy(gate.pid, 2, gate.connection);
        await gate.connection.query('COMMIT');
        expect((await one).status).toBe(200);
        expect((await two).status).toBe(409);
      } finally {
        await gate.connection.query('ROLLBACK');
        gate.connection.release();
        await one;
        await two;
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
      gate = await blockUser(f.f.buyer.id),
      key = randomUUID(),
      calls = Array.from({ length: 100 }, () => pay(f, key).then((r) => r));
    try {
      await blockedBy(gate.pid, 10, gate.connection);
      await gate.connection.query('COMMIT');
      const results = await Promise.all(calls);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(
        await db.ledgerJournal.count({
          where: { orderId: f.id, type: 'OrderPayment' },
        }),
      ).toBe(1);
    } finally {
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
    }
  }, 30000);
  it.each(['wrongRecipient', 'wrongAmount'] as const)(
    'database rejects %s even if a service produces balanced payment entries',
    async (kind) => {
      const f = await ready(),
        ledger = app.get(LedgerService),
        original = ledger.postOrder.bind(ledger);
      const foreign = await reader();
      await fund(foreign, 1000);
      const account = await db.walletAccount.findUniqueOrThrow({
        where: { ownerId: foreign.id },
      });
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
            return tx.ledgerJournal.create({
              data: {
                type: 'OrderPayment',
                orderId: id,
                receiptId: receipt,
                postedAt: now,
                entries: {
                  create: [
                    {
                      accountId: account.id,
                      credit: BigInt(amount),
                      debit: 0n,
                    },
                    {
                      accountId: accounts.hold,
                      credit: 0n,
                      debit: BigInt(amount),
                    },
                  ],
                },
              },
            });
          },
        );
      try {
        await pay(f).expect(500);
      } finally {
        mock.mockRestore();
      }
      expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(
        0,
      );
      expect((await wallet(f.f.buyer)).available).toBe(500000);
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
    async (table) => {
      const f = await ready();
      await pay(f).expect(200);
      await cancelPaid(f).expect(200);
      const before = await stateCounts(f.f.l.entityId);
      const action = ['exclusive_commitments', 'direct_orders'].includes(table)
        ? 'UPDATE'
        : 'INSERT';
      await pool.query(
        `CREATE FUNCTION fail_close() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failpoint'; END $$; CREATE TRIGGER fail_close BEFORE ${action} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_close()`,
      );
      try {
        await expect(app.get(OrdersService).refund(f.id)).rejects.toBeDefined();
      } finally {
        await pool.query(
          `DROP TRIGGER fail_close ON ${table}; DROP FUNCTION fail_close()`,
        );
      }
      expect(await stateCounts(f.f.l.entityId)).toEqual(before);
      expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(
        1,
      );
      expect((await orderView(f.id, f.f.buyer)).state).toBe(
        'SettlementPending',
      );
      await app.get(OrdersService).refund(f.id);
      expect((await wallet(f.f.buyer)).available).toBe(500000);
    },
  );
});
