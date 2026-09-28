import sharp from 'sharp';
import { digest } from '../src/modules/media/media-storage.js';

import { OrderClock } from '../src/modules/orders/order-clock.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';

import { OrdersService } from '../src/modules/orders/orders.service.js';

import { OrderExpiryWorker } from '../src/modules/orders/order-expiry.service.js';

import type { Wire } from '../src/modules/commands/domain-error.js';

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

describe('Delivery overdue: real PostgreSQL and HTTP', () => {
  const schema = `delivery_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
  const migration = '20260928070000_delivery_overdue';
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
    await pay(legacy).expect(200);
    await accept(legacy).expect(200);
    legacyEvidence = await reserved(legacy);
    await upload(legacy, legacyEvidence.id, legacyEvidence.bytes).expect(200);
    await register(legacy, shipBody([legacyEvidence.id])).expect(200);
    // Also preserve an already overdue accepted Order from 0.16/0.18.
    const overdueLegacy = await accepted();
    const priorPreparation = await db.orderPreparation.findUniqueOrThrow({
      where: { orderId: overdueLegacy.id },
    });
    const priorClock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(priorPreparation.pickupDeadline);
    try {
      await app.get(OrdersService).expirePickup(overdueLegacy.id);
    } finally {
      priorClock.mockRestore();
    }
    const legacyShipment = await db.directShipment.findUniqueOrThrow({
      where: { orderId: legacy.id },
    });
    await emit({
      eventId: randomUUID(),
      shipmentId: legacyShipment.id,
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
      for (const table of [
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
    if (pool && /^delivery_http_test_[a-f0-9]{32}$/.test(schema))
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
    await db.authSession.updateMany({
      where: { id: { in: [f.f.seller.sessionId, f.f.buyer.sessionId] } },
      data: { expiresAt: new Date(now.getTime() + 86400000) },
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
        occurredAt: new Date().toISOString(),
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
    await db.authSession.update({
      where: { id: operator.sessionId },
      data: { expiresAt: new Date(now.getTime() + 86400000) },
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
    const p = await db.carrierPickupEvent.findUniqueOrThrow({
      where: { id: fixture.event.eventId },
    });
    return { ...fixture, p, r: r.body };
  }
  async function overdue() {
    const x = await transit();
    await freeze(x.f, x.p.deliveryDeadline!);
    return x;
  }
  async function stable(f: PaymentFixture) {
    return {
      listing: await db.listing.findUnique({ where: { id: f.f.l.entityId } }),
      commitment: await db.exclusiveCommitment.findFirst({
        where: { currentContextId: f.r.contextId },
      }),
      context: await db.workflowContext.findUnique({
        where: { id: f.r.contextId },
      }),
      ledger: await db.ledgerEntry.findMany({
        orderBy: [{ journalId: 'asc' }, { accountId: 'asc' }],
      }),
      shipment: await db.directShipment.findUnique({
        where: { orderId: f.id },
      }),
    };
  }
  it('upgrades all sixteen migrations preserving actual Applied pickup and existing overdue reviews', async () => {
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
    const receipt = await db.mutationReceipt.findUniqueOrThrow({
      where: { id: r.receipt.id },
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
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { receiptId: r.body.id },
    });
    expect(JSON.stringify(audit)).not.toContain(description);
    await expect(app.get(OrdersService).expireDelivery(f.id)).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
  it('Buyer supplements worker review without changing its opening identity or incrementing Order again', async () => {
    const { f } = await overdue();
    await app.get(OrdersService).expireDelivery(f.id);
    const before = await db.orderDeliveryReview.findUniqueOrThrow({
      where: { orderId: f.id },
    });
    await report(f, 4).expect(409);
    const r = await report(f, 5).expect(200);
    expect(r.body.version).toBe(5);
    expect(
      await db.orderDeliveryReview.findUnique({ where: { orderId: f.id } }),
    ).toEqual(before);
    expect(
      await db.orderNonReceiptReport.count({ where: { orderId: f.id } }),
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
      await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
    ).toBe(0);
  });
  it.each(['LOCKED', 'RESTRICTED'] as const)(
    'Buyer %s retains reporting and both participant reads',
    async (status) => {
      const { f } = await overdue();
      await db.user.updateMany({
        where: { id: { in: [f.f.buyer.id, f.f.seller.id] } },
        data: { status },
      });
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
        await db.user.update({
          where: { id: f.f.buyer.id },
          data: { emailVerifiedAt: null },
        });
      if (kind === 'disabled')
        await db.user.update({
          where: { id: f.f.buyer.id },
          data: { status: 'DISABLED' },
        });
      if (kind === 'revoked')
        await db.authSession.update({
          where: { id: f.f.buyer.sessionId },
          data: { revokedAt: new Date() },
        });
      if (kind === 'role')
        await db.userRole.deleteMany({
          where: { userId: f.f.buyer.id, role: 'MEMBER' },
        });
      const r = await report(f, 4, f.f.buyer, key);
      expect([401, 403]).toContain(r.status);
      expect(
        await db.orderNonReceiptReport.count({ where: { orderId: f.id } }),
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
      await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
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
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
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
    expect(await db.mutationReceipt.count({ where: { key } })).toBe(1);
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
      await db.mutationReceipt.count({
        where: { operation: 'expireOrderDelivery', key: f.id },
      }),
    ).toBe(1);
  });
  it('duplicate and conflicting pickup after overdue review do not resume transit or overwrite delivery review', async () => {
    const { f, event, r } = await overdue();
    await app.get(OrdersService).expireDelivery(f.id);
    const before = await db.orderDeliveryReview.findUnique({
      where: { orderId: f.id },
    });
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
      await db.orderDeliveryReview.findUnique({ where: { orderId: f.id } }),
    ).toEqual(before);
    await report(f, 5).expect(200);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('an existing conflicting-pickup review is retained alongside later overdue evidence', async () => {
    const { f, event, p } = await transit();
    await emit({
      ...event,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
    }).expect(200);
    const review = await db.carrierPickupReview.findUnique({
      where: { orderId: f.id },
    });
    await freeze(f, p.deliveryDeadline!);
    await app.get(OrdersService).expireDelivery(f.id);
    await report(f, 5).expect(200);
    expect(
      await db.carrierPickupReview.findUnique({ where: { orderId: f.id } }),
    ).toEqual(review);
    expect((await orderView(f.id, f.f.buyer)).version).toBe(5);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('20 same-key reports commit one report/receipt while different keys cannot duplicate it', async () => {
    const { f } = await overdue(),
      key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => report(f, 4, f.f.buyer, key)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(
      results.filter((r) => r.headers['idempotency-replayed'] === 'false'),
    ).toHaveLength(1);
    await report(f, 5).expect(409);
    expect(
      await db.orderNonReceiptReport.count({ where: { orderId: f.id } }),
    ).toBe(1);
  });
  it('different Buyer keys serialize through a real participant barrier with one winner', async () => {
    const { f } = await overdue(),
      lock = await blockUser(f.f.buyer.id);
    const a = report(f).then((r) => r),
      b = report(f).then((r) => r);
    try {
      await blockedBy(lock.pid, 2, lock.connection);
    } finally {
      await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
    const results = await Promise.all([a, b]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
    ).toBe(1);
    expect((await reconcile()).balanced).toBe(true);
  });
  it.each(['worker', 'buyer'] as const)(
    '%s wins deterministically against the other path blocked at the actual ledger row',
    async (first) => {
      const { f } = await overdue(),
        lock = await pool.connect();
      await lock.query('BEGIN');
      await lock.query(
        'SELECT id FROM wallet_accounts WHERE order_id=$1 FOR UPDATE',
        [f.id],
      );
      const pid = (await lock.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const worker = () =>
        app
          .get(OrdersService)
          .expireDelivery(f.id)
          .then((r) => ({ status: 200, r }))
          .catch((e) => ({ status: e.getStatus(), r: null }));
      const buyer = () => report(f).then((r) => ({ status: r.status, r }));
      const a = first === 'worker' ? worker() : buyer();
      let b: ReturnType<typeof worker> | ReturnType<typeof buyer>;
      try {
        await blockedBy(pid, 1, lock);
        b = first === 'worker' ? buyer() : worker();
        await blockedBy(pid, 2, lock);
      } finally {
        await lock.query('ROLLBACK');
        lock.release();
      }
      expect((await a).status).toBe(200);
      expect((await b!).status).toBe(409);
      if (first === 'worker') await report(f, 5).expect(200);
      expect(
        await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
      ).toBe(1);
      expect(
        await db.orderNonReceiptReport.count({ where: { orderId: f.id } }),
      ).toBe(1);
      expect((await reconcile()).balanced).toBe(true);
    },
  );
  it('two workers dedupe through a real Buyer lock', async () => {
    const { f } = await overdue(),
      lock = await blockUser(f.f.buyer.id);
    const a = app.get(OrdersService).expireDelivery(f.id),
      b = app.get(OrdersService).expireDelivery(f.id);
    try {
      await blockedBy(lock.pid, 2, lock.connection);
    } finally {
      await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
    const results = await Promise.all([a, b]);
    expect(results[0].receipt).toEqual(results[1].receipt);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
  });
  it('uses DB time after ledger contention: arrival before deadline can qualify after the wait', async () => {
    const { f, p } = await transit();
    await freeze(f, new Date(p.deliveryDeadline!.getTime() - 1));
    const lock = await pool.connect();
    await lock.query('BEGIN');
    await lock.query(
      'SELECT id FROM wallet_accounts WHERE order_id=$1 FOR UPDATE',
      [f.id],
    );
    const pid = (await lock.query('SELECT pg_backend_pid() pid')).rows[0].pid,
      pending = report(f).then((r) => r);
    try {
      await blockedBy(pid, 1, lock);
      vi.mocked(app.get(OrderClock).now).mockResolvedValue(p.deliveryDeadline!);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
    }
    expect((await pending).status).toBe(200);
  });
  it('session expiry after ledger wait rolls back despite earlier successful guards', async () => {
    const { f } = await overdue(),
      session = await db.authSession.findUniqueOrThrow({
        where: { id: f.f.buyer.sessionId },
      });
    const lock = await pool.connect();
    await lock.query('BEGIN');
    await lock.query(
      'SELECT id FROM wallet_accounts WHERE order_id=$1 FOR UPDATE',
      [f.id],
    );
    const pid = (await lock.query('SELECT pg_backend_pid() pid')).rows[0].pid,
      pending = report(f).then((r) => r);
    try {
      await blockedBy(pid, 1, lock);
      vi.mocked(app.get(OrderClock).now).mockResolvedValue(session.expiresAt);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
    }
    expect((await pending).status).toBe(401);
    expect(
      await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
    ).toBe(0);
  });
  it('role revocation under a user barrier is rechecked before receipt replay', async () => {
    const { f } = await overdue(),
      key = randomUUID();
    await report(f, 4, f.f.buyer, key).expect(200);
    const lock = await blockUser(f.f.buyer.id),
      pending = report(f, 4, f.f.buyer, key).then((r) => r);
    try {
      await blockedBy(lock.pid, 1, lock.connection);
      await lock.connection.query(
        "DELETE FROM user_roles WHERE user_id=$1 AND role='MEMBER'",
        [f.f.buyer.id],
      );
      await lock.connection.query('COMMIT');
    } finally {
      await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
    expect((await pending).status).toBe(403);
  });
  it.each(['receipt', 'audit', 'outbox'] as const)(
    'Buyer %s failure rolls back review/report/state and allows same-key retry',
    async (stage) => {
      const { f } = await overdue(),
        key = randomUUID(),
        table =
          stage === 'receipt'
            ? 'mutation_receipts'
            : stage === 'audit'
              ? 'audit_events'
              : 'outbox_events';
      const condition =
        stage === 'receipt'
          ? "NEW.operation='reportOrderNonReceipt'"
          : stage === 'audit'
            ? "NEW.action='reportOrderNonReceipt'"
            : "NEW.type='OrderNonReceiptReported'";
      await pool.query(
        `CREATE FUNCTION fail_delivery_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_delivery_test BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_delivery_test()`,
      );
      try {
        await report(f, 4, f.f.buyer, key).expect(500);
      } finally {
        await pool.query(
          `DROP TRIGGER fail_delivery_test ON ${table}; DROP FUNCTION fail_delivery_test()`,
        );
      }
      expect(
        await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
      ).toBe(0);
      expect(
        await db.orderNonReceiptReport.count({ where: { orderId: f.id } }),
      ).toBe(0);
      expect(
        await db.directOrder.findUnique({ where: { id: f.id } }),
      ).toMatchObject({ state: 'InTransit', version: 4 });
      await report(f, 4, f.f.buyer, key).expect(200);
    },
  );
  it('worker outbox failure preserves InTransit and retries safely', async () => {
    const { f } = await overdue();
    await pool.query(
      "CREATE FUNCTION fail_worker_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='OrderDeliveryReviewOpened' THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_worker_delivery BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_worker_delivery()",
    );
    try {
      await expect(
        app.get(OrdersService).expireDelivery(f.id),
      ).rejects.toThrow();
    } finally {
      await pool.query(
        'DROP TRIGGER fail_worker_delivery ON outbox_events; DROP FUNCTION fail_worker_delivery()',
      );
    }
    expect(
      await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
    ).toBe(0);
    expect(
      await db.directOrder.findUnique({ where: { id: f.id } }),
    ).toMatchObject({ state: 'InTransit', version: 4 });
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
      await db.orderDeliveryReview.count({ where: { orderId: x.f.id } }),
    ).toBe(1);
    expect(
      await db.orderDeliveryReview.count({ where: { orderId: future.f.id } }),
    ).toBe(0);
    const count = await db.mutationReceipt.count({
      where: { operation: 'expireOrderDelivery' },
    });
    await app.get(OrderExpiryWorker).tick();
    expect(
      await db.mutationReceipt.count({
        where: { operation: 'expireOrderDelivery' },
      }),
    ).toBe(count);
  });
  it('worker failed review remains in backlog and recovers in the next sweep', async () => {
    const { f } = await overdue();
    await pool.query(
      `CREATE FUNCTION fail_one_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id='${f.id}'::uuid THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_one_delivery BEFORE INSERT ON order_delivery_reviews FOR EACH ROW EXECUTE FUNCTION fail_one_delivery()`,
    );
    try {
      const result = await app.get(OrderExpiryWorker).tick();
      expect(result.failed).toBe(1);
      expect(result.deliveryRemaining).toBe(1);
      expect(
        await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
      ).toBe(0);
    } finally {
      await pool.query(
        'DROP TRIGGER fail_one_delivery ON order_delivery_reviews; DROP FUNCTION fail_one_delivery()',
      );
    }
    const recovered = await app.get(OrderExpiryWorker).tick();
    expect(recovered.failed).toBe(0);
    expect(recovered.deliveryRemaining).toBe(0);
    expect(
      await db.orderDeliveryReview.count({ where: { orderId: f.id } }),
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
    await db.user.updateMany({
      where: { id: { in: [f.f.buyer.id, f.f.seller.id] } },
      data: { status: 'DISABLED' },
    });
    await db.authSession.updateMany({
      where: { userId: { in: [f.f.buyer.id, f.f.seller.id] } },
      data: { revokedAt: new Date() },
    });
    await app.get(OrdersService).expireDelivery(f.id);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('database rejects forged review, cross-Order pickup and missing receipts; retained records are immutable', async () => {
    const one = await transit(),
      two = await transit();
    await freeze(one.f, one.p.deliveryDeadline!);
    for (const pickupEventId of [one.event.eventId, two.event.eventId])
      await expect(
        db.orderDeliveryReview.create({
          data: {
            orderId: one.f.id,
            pickupEventId,
            openedAt: one.p.deliveryDeadline!,
            openedBy: 'DeadlineWorker',
            receiptId: two.r.id,
          },
        }),
      ).rejects.toThrow();
    await report(one.f).expect(200);
    for (const table of ['order_delivery_reviews', 'order_non_receipt_reports'])
      await expect(
        pool.query(`DELETE FROM ${table} WHERE order_id=$1`, [one.f.id]),
      ).rejects.toThrow();
    await expect(
      pool.query(
        "UPDATE order_non_receipt_reports SET description='Tampered private report text' WHERE order_id=$1",
        [one.f.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "UPDATE order_delivery_reviews SET opened_by='DeadlineWorker' WHERE order_id=$1",
        [one.f.id],
      ),
    ).rejects.toThrow();
    await expect(app.get(OrdersService).refund(one.f.id)).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
});
