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

describe('Order acceptance and pickup review: real PostgreSQL and HTTP', () => {
  const schema = `preparation_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
  const migration = '20260928030000_order_preparation';
  let upgradeBefore: Record<string, unknown>,
    upgradeAfter: Record<string, unknown>;
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
      .filter((n) => /^\d/.test(n) && n < migration)
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
    // Exercise upgrade with a real active reservation and posted topup, built
    // through the pre-existing APIs. Creation does not need preparation storage.
    legacy = await ready();
    const snapshot = async () => {
      const rows: Record<string, unknown> = {};
      for (const table of [
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
        rows[table] = (
          await pool.query(`SELECT * FROM ${table} ORDER BY 1`)
        ).rows;
      return rows;
    };
    upgradeBefore = await snapshot();
    await pool.query(
      readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8'),
    );
    upgradeAfter = await snapshot();
    // Current handlers can read additive fulfillment tables after the target upgrade.
    for (const name of readdirSync('prisma/migrations')
      .filter((n) => /^\d/.test(n) && n > migration)
      .sort())
      await pool.query(
        readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'),
      );
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool && /^preparation_http_test_[a-f0-9]{32}$/.test(schema))
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
  it('upgrades twelve migrations preserving real unpaid commitments, immutable snapshots, journals and receipts', async () => {
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
      (await db.listing.findUniqueOrThrow({ where: { id: f.f.l.entityId } }))
        .version,
    ).toBe(f.f.l.version + 1);
    expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(1);
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
    await get('/listings/' + f.f.l.entityId).expect(404);
    await get('/me/orders/' + f.id, await reader()).expect(404);
    expect(
      (await get('/me/orders?state=Preparing', f.f.seller).expect(200)).body
        .items[0].id,
    ).toBe(f.id);
    const audit = await db.auditEvent.findUniqueOrThrow({
      where: { receiptId: result.id },
    });
    expect(audit.before).toEqual({
      state: 'PendingSellerConfirmation',
      version: 2,
    });
  });
  it('shipping uses frozen destination even after the buyer edits their address', async () => {
    const f = await paid(),
      frozen = (await orderView(f.id, f.f.buyer)).ownAddress;
    await pool.query(
      "UPDATE member_addresses SET detail='Edited after agreement' WHERE id=$1",
      [f.f.destination.id],
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
      await db.user.update({
        where: { id: actor.id },
        data: { status: 'DISABLED' },
      });
      status = 401;
    }
    if (kind === 'unverified') {
      await db.user.update({
        where: { id: actor.id },
        data: { emailVerifiedAt: null },
      });
      status = 401;
    }
    if (kind === 'role')
      await db.userRole.deleteMany({ where: { userId: actor.id } });
    if (kind === 'revoked') {
      await db.authSession.update({
        where: { id: actor.sessionId },
        data: { revokedAt: new Date() },
      });
      status = 401;
    }
    const before = await stateCounts(f.f.l.entityId);
    await accept(f, randomUUID(), actor).expect(status);
    expect(await stateCounts(f.f.l.entityId)).toEqual(before);
    expect(await db.orderPreparation.count({ where: { orderId: f.id } })).toBe(
      0,
    );
  });
  it.each(['RESTRICTED', 'LOCKED'] as const)(
    '%s seller can process paid obligations even if buyer is disabled',
    async (status) => {
      const f = await paid();
      await db.user.update({ where: { id: f.f.seller.id }, data: { status } });
      await db.user.update({
        where: { id: f.f.buyer.id },
        data: { status: 'DISABLED' },
      });
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
        o = await db.directOrder.findUniqueOrThrow({ where: { id: f.id } }),
        time = new Date(o.sellerConfirmationDeadline!.getTime() + offset);
      await db.authSession.update({
        where: { id: f.f.seller.sessionId },
        data: { expiresAt: new Date(time.getTime() + 3600000) },
      });
      const clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(time);
      try {
        await accept(f).expect(offset < 0 ? 200 : 409);
      } finally {
        clock.mockRestore();
      }
      expect(
        await db.orderPreparation.count({ where: { orderId: f.id } }),
      ).toBe(offset < 0 ? 1 : 0);
    },
  );
  it.each(['accept', 'cancel'] as const)(
    '%s wins against the other command with a verified database barrier',
    async (first) => {
      const f = await paid(),
        gate = await blockUser(f.f.seller.id),
        a = () => accept(f).then((r) => r),
        b = () => cancelPaid(f).then((r) => r);
      const one = first === 'accept' ? a() : b();
      let two: ReturnType<typeof a> | undefined;
      try {
        await blockedBy(gate.pid, 1, gate.connection);
        two = first === 'accept' ? b() : a();
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
      expect((await orderView(f.id, f.f.buyer)).state).toBe(
        first === 'accept' ? 'Preparing' : 'SettlementPending',
      );
      expect(
        await db.orderPreparation.count({ where: { orderId: f.id } }),
      ).toBe(first === 'accept' ? 1 : 0);
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
        o = await db.directOrder.findUniqueOrThrow({ where: { id: f.id } }),
        gate = await blockUser(f.f.seller.id),
        clock = vi.spyOn(app.get(OrderClock), 'now'),
        call = accept(f).then((r) => r);
      try {
        await blockedBy(gate.pid, 1, gate.connection);
        expect(clock).not.toHaveBeenCalled();
        if (kind === 'deadline') {
          await gate.connection.query(
            'UPDATE auth_sessions SET expires_at=$1 WHERE id=$2',
            [
              new Date(o.sellerConfirmationDeadline!.getTime() + 3600000),
              f.f.seller.sessionId,
            ],
          );
          clock.mockResolvedValue(o.sellerConfirmationDeadline!);
        } else if (kind === 'session') {
          const time = new Date(Date.now() + 60000);
          await gate.connection.query(
            'UPDATE auth_sessions SET expires_at=$1 WHERE id=$2',
            [time, f.f.seller.sessionId],
          );
          clock.mockResolvedValue(time);
        } else if (kind === 'role')
          await gate.connection.query(
            "DELETE FROM user_roles WHERE user_id=$1 AND role='MEMBER'",
            [f.f.seller.id],
          );
        else
          await gate.connection.query(
            'UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1',
            [f.f.seller.sessionId],
          );
        await gate.connection.query('COMMIT');
        expect((await call).status).toBe(
          kind === 'deadline' ? 409 : kind === 'role' ? 403 : 401,
        );
      } finally {
        await gate.connection.query('ROLLBACK');
        gate.connection.release();
        await call;
        clock.mockRestore();
      }
      expect(
        await db.orderPreparation.count({ where: { orderId: f.id } }),
      ).toBe(0);
    },
  );
  it('concurrent same-key acceptance survives lost acknowledgments with one receipt and deadline', async () => {
    const f = await paid(),
      gate = await blockUser(f.f.seller.id),
      key = randomUUID(),
      calls = Array.from({ length: 20 }, () => accept(f, key).then((r) => r));
    try {
      await blockedBy(gate.pid, 10, gate.connection);
      await gate.connection.query('COMMIT');
      const results = await Promise.all(calls);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    } finally {
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
    }
    expect(await db.orderPreparation.count({ where: { orderId: f.id } })).toBe(
      1,
    );
  });
  it.each([
    'order_preparations',
    'direct_orders',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ] as const)(
    'acceptance failure at %s rolls back and same key retries',
    async (table) => {
      const f = await paid(),
        key = randomUUID(),
        before = await stateCounts(f.f.l.entityId);
      await pool.query(
        `CREATE FUNCTION fail_accept() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failpoint'; END $$; CREATE TRIGGER fail_accept BEFORE ${table === 'direct_orders' ? 'UPDATE' : 'INSERT'} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_accept()`,
      );
      try {
        await accept(f, key).expect(500);
      } finally {
        await pool.query(
          `DROP TRIGGER fail_accept ON ${table}; DROP FUNCTION fail_accept()`,
        );
      }
      expect(await stateCounts(f.f.l.entityId)).toEqual(before);
      expect(
        await db.orderPreparation.count({ where: { orderId: f.id } }),
      ).toBe(0);
      await accept(f, key).expect(200);
    },
  );
  it.each([-1, 0, 1])(
    'pickup deadline offset %i opens a review without refund or stock release',
    async (offset) => {
      const f = await paid();
      await accept(f).expect(200);
      const p = await db.orderPreparation.findUniqueOrThrow({
          where: { orderId: f.id },
        }),
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
      expect(await db.pickupReview.count({ where: { orderId: f.id } })).toBe(
        offset < 0 ? 0 : 1,
      );
      expect((await stateCounts(f.f.l.entityId)).active).toBe(1);
      expect((await wallet(f.f.buyer)).transactionHeld).toBe(230000);
      expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(
        1,
      );
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
    const p = await db.orderPreparation.findUniqueOrThrow({
      where: { orderId: f.id },
    });
    await db.user.updateMany({
      where: { id: { in: [f.f.buyer.id, f.f.seller.id] } },
      data: { status: 'DISABLED' },
    });
    let clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(p.pickupDeadline);
    await pool.query(
      `CREATE FUNCTION fail_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failpoint'; END $$; CREATE TRIGGER fail_review BEFORE INSERT ON pickup_reviews FOR EACH ROW EXECUTE FUNCTION fail_review()`,
    );
    try {
      await expect(
        app.get(OrdersService).expirePickup(f.id),
      ).rejects.toBeDefined();
    } finally {
      await pool.query(
        'DROP TRIGGER fail_review ON pickup_reviews; DROP FUNCTION fail_review()',
      );
      clock.mockRestore();
    }
    expect(
      (await db.directOrder.findUniqueOrThrow({ where: { id: f.id } })).state,
    ).toBe('Preparing');
    await app.close();
    app = await makeApp();
    clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(p.pickupDeadline);
    const gate = await blockUser(f.f.buyer.id),
      calls = [
        app.get(OrdersService).expirePickup(f.id),
        app.get(OrdersService).expirePickup(f.id),
      ];
    try {
      await blockedBy(gate.pid, 2, gate.connection);
      await gate.connection.query('COMMIT');
      const r = await Promise.all(calls);
      expect(r[0].receipt).toEqual(r[1].receipt);
    } finally {
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
      clock.mockRestore();
    }
    expect(await db.pickupReview.count({ where: { orderId: f.id } })).toBe(1);
    expect(await db.ledgerJournal.count({ where: { orderId: f.id } })).toBe(1);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('SQL refuses forged acceptance/review, changed deadlines or deleting preparation history', async () => {
    const f = await paid();
    await expect(
      pool.query(
        "UPDATE direct_orders SET state='Preparing',version=3 WHERE id=$1",
        [f.id],
      ),
    ).rejects.toThrow('Order acceptance receipt/deadline mismatch');
    await accept(f).expect(200);
    await expect(
      pool.query(
        "UPDATE direct_orders SET state='ResolutionPending',version=4 WHERE id=$1",
        [f.id],
      ),
    ).rejects.toThrow('Pickup verification task mismatch');
    await expect(
      pool.query(
        "UPDATE order_preparations SET pickup_deadline=pickup_deadline+interval '1 hour' WHERE order_id=$1",
        [f.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM order_preparations WHERE order_id=$1', [f.id]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('worker scans overdue preparations and reports unresolved reviews separately from executable backlog', async () => {
    const f = await paid();
    await accept(f).expect(200);
    const p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      }),
      clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(new Date(p.pickupDeadline.getTime() + 1000));
    try {
      const r = await app.get(OrderExpiryWorker).tick();
      expect(r.failed).toBe(0);
      expect(r.pickupRemaining).toBe(0);
      expect(r.openPickupReviews).toBeGreaterThan(0);
      expect(r.oldestPickupReviewAgeSeconds).toBeGreaterThanOrEqual(0);
      const before = await db.pickupReview.count();
      const again = await app.get(OrderExpiryWorker).tick();
      expect(again.openPickupReviews).toBe(before);
      expect(await db.pickupReview.count()).toBe(before);
    } finally {
      clock.mockRestore();
    }
    expect((await orderView(f.id, f.f.buyer)).state).toBe('ResolutionPending');
    expect((await reconcile()).balanced).toBe(true);
  });
  it.each(['accept', 'expiry'] as const)(
    '%s wins confirmation race without refunding an accepted Order',
    async (first) => {
      const f = await paid(),
        o = await db.directOrder.findUniqueOrThrow({ where: { id: f.id } }),
        time = new Date(
          o.sellerConfirmationDeadline!.getTime() +
            (first === 'accept' ? -1 : 0),
        );
      await db.authSession.update({
        where: { id: f.f.seller.sessionId },
        data: { expiresAt: new Date(time.getTime() + 3600000) },
      });
      const gate = await blockUser(f.f.seller.id),
        clock = vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(time);
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
        await blockedBy(gate.pid, 1, gate.connection);
        two = first === 'accept' ? b() : a();
        await blockedBy(gate.pid, 2, gate.connection);
        await gate.connection.query('COMMIT');
        expect((await one).status).toBe(200);
        expect((await two).status).toBe(409);
      } finally {
        await gate.connection.query('ROLLBACK');
        gate.connection.release();
        await one;
        await two;
        clock.mockRestore();
      }
      expect((await orderView(f.id, f.f.buyer)).state).toBe(
        first === 'accept' ? 'Preparing' : 'SettlementPending',
      );
    },
  );
  it('acceptance checks deadline after waiting for the hold account lock', async () => {
    const f = await paid(),
      o = await db.directOrder.findUniqueOrThrow({ where: { id: f.id } }),
      hold = await db.walletAccount.findUniqueOrThrow({
        where: { orderId: f.id },
      });
    await db.authSession.update({
      where: { id: f.f.seller.sessionId },
      data: {
        expiresAt: new Date(o.sellerConfirmationDeadline!.getTime() + 3600000),
      },
    });
    const gate = await pool.connect();
    await gate.query('BEGIN');
    await gate.query('SELECT id FROM wallet_accounts WHERE id=$1 FOR UPDATE', [
      hold.id,
    ]);
    const pid = (await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const clock = vi.spyOn(app.get(OrderClock), 'now'),
      call = accept(f).then((r) => r);
    try {
      await blockedBy(pid, 1, gate);
      expect(clock).not.toHaveBeenCalled();
      clock.mockResolvedValue(o.sellerConfirmationDeadline!);
      await gate.query('COMMIT');
      expect((await call).status).toBe(409);
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await call;
      clock.mockRestore();
    }
    expect(await db.orderPreparation.count({ where: { orderId: f.id } })).toBe(
      0,
    );
  });
  it.each([
    'direct_orders',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
  ] as const)(
    'overdue review failure at %s is atomic and retryable',
    async (table) => {
      const f = await paid();
      await accept(f).expect(200);
      const p = await db.orderPreparation.findUniqueOrThrow({
          where: { orderId: f.id },
        }),
        before = await stateCounts(f.f.l.entityId),
        clock = vi
          .spyOn(app.get(OrderClock), 'now')
          .mockResolvedValue(p.pickupDeadline);
      await pool.query(
        `CREATE FUNCTION fail_overdue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failpoint'; END $$; CREATE TRIGGER fail_overdue BEFORE ${table === 'direct_orders' ? 'UPDATE' : 'INSERT'} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_overdue()`,
      );
      try {
        await expect(
          app.get(OrdersService).expirePickup(f.id),
        ).rejects.toBeDefined();
      } finally {
        await pool.query(
          `DROP TRIGGER fail_overdue ON ${table}; DROP FUNCTION fail_overdue()`,
        );
        clock.mockRestore();
      }
      expect(await stateCounts(f.f.l.entityId)).toEqual(before);
      expect(await db.pickupReview.count({ where: { orderId: f.id } })).toBe(0);
      const retryClock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(p.pickupDeadline);
      try {
        await app.get(OrdersService).expirePickup(f.id);
      } finally {
        retryClock.mockRestore();
      }
      expect(await db.pickupReview.count({ where: { orderId: f.id } })).toBe(1);
    },
  );
});
