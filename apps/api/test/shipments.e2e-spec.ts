import sharp from 'sharp';
import { digest } from '../src/modules/media/media-storage.js';

import { OrderClock } from '../src/modules/orders/order-clock.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';

import { OrdersService } from '../src/modules/orders/orders.service.js';

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

describe('Direct shipment registration: real PostgreSQL and HTTP', () => {
  const schema = `shipment_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
  const migration = '20260928050000_direct_shipment_registration';
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
    const snapshot = async () => {
      const rows: Record<string, unknown> = {};
      for (const table of [
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
    if (pool && /^shipment_http_test_[a-f0-9]{32}$/.test(schema))
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
    await db.authSession.updateMany({
      where: { id: { in: [f.f.seller.sessionId, f.f.buyer.sessionId] } },
      data: { expiresAt: new Date(now.getTime() + 86400000) },
    });
  }
  it('upgrades fourteen migrations preserving accepted Order, Ready evidence, receipts and money', async () => {
    expect(upgradeAfter).toEqual(upgradeBefore);
    const r = await register(legacy, shipBody([legacyEvidence.id])).expect(200);
    validates('ShipmentCommandReceipt', r.body);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('registers one immutable outbound with frozen contacts, selected images and fee without changing Order, hold or commitment', async () => {
    const { f, e, body } = await dispatchable();
    const before = await db.directOrder.findUniqueOrThrow({
        where: { id: f.id },
      }),
      money = await wallet(f.f.buyer),
      l = await db.listing.findUniqueOrThrow({ where: { id: f.f.l.entityId } });
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
    const a = await db.agreementSnapshot.findUniqueOrThrow({
        where: { contextId: f.r.contextId },
      }),
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
    expect(
      await db.directOrder.findUniqueOrThrow({ where: { id: f.id } }),
    ).toEqual(before);
    expect(await db.listing.findUniqueOrThrow({ where: { id: l.id } })).toEqual(
      l,
    );
    expect((await wallet(f.f.buyer)).transactionHeld).toBe(
      money.transactionHeld,
    );
    expect(money.transactionHeld).toBeGreaterThan(0);
    expect(
      (await orderView(f.id, f.f.seller)).shipmentRegistrationEnabled,
    ).toBe(false);
    expect((await reconcile()).balanced).toBe(true);
    expect(
      await db.outboxEvent.count({
        where: {
          type: 'DirectShipmentRegistered',
          audit: { contextId: f.r.contextId },
        },
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
    const p = await db.orderPreparation.findUniqueOrThrow({
      where: { orderId: f.id },
    });
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
      await db.user.updateMany({
        where: { id: { in: [f.f.seller.id, f.f.buyer.id] } },
        data: { status },
      });
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
    await db.user.update({
      where: { id: f.f.buyer.id },
      data: { status: 'DISABLED' },
    });
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
    expect(await db.directShipment.count({ where: { orderId: f.id } })).toBe(0);
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
    expect(await db.directShipment.count({ where: { orderId: f.id } })).toBe(0);
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
    expect(await db.directShipment.count({ where: { orderId: f.id } })).toBe(1);
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
    expect(await db.directShipment.count({ where: { orderId: b.f.id } })).toBe(
      0,
    );
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
    const p = await db.orderPreparation.findUniqueOrThrow({
      where: { orderId: f.id },
    });
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
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
    await extendSession(f, p.pickupDeadline);
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    await register(f, body).expect(409);
    expect(
      (await db.directOrder.findUniqueOrThrow({ where: { id: f.id } })).state,
    ).toBe('Preparing');
    expect(await db.directShipment.count({ where: { orderId: f.id } })).toBe(0);
  });
  it('registers just before deadline but does not prevent the later pickup review', async () => {
    const { f, body } = await dispatchable(),
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
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
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
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
    const results = await Promise.all(
      Array.from({ length: 20 }, () => register(f, body, f.f.seller, key)),
    );
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(200));
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await db.directShipment.count({ where: { orderId: f.id } })).toBe(1);
    expect(
      await db.shipmentPackagingEvidence.count({ where: { orderId: f.id } }),
    ).toBe(1);
  });
  it('different keys racing for one Order have one winner under a participant DB barrier', async () => {
    const { f, body } = await dispatchable(),
      block = await blockUser(f.f.seller.id);
    const contenders = [
      register(f, body).then((r) => r),
      register(f, { ...body, trackingCode: tracking() }).then((r) => r),
    ];
    try {
      await blockedBy(block.pid, 2, block.connection);
      await block.connection.query('COMMIT');
    } finally {
      await block.connection.query('ROLLBACK');
      block.connection.release();
    }
    expect((await Promise.all(contenders)).map((r) => r.status).sort()).toEqual(
      [200, 409],
    );
  });
  it('independent Orders racing for one tracking code have one winner under its DB advisory barrier', async () => {
    const a = await dispatchable(),
      b = await dispatchable(),
      code = tracking(),
      block = await pool.connect();
    await block.query('BEGIN');
    await block.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,78301))',
      [`LatLaiSimulator/${code}`],
    );
    const pid = (await block.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const contenders = [
      register(a.f, { ...a.body, trackingCode: code }).then((r) => r),
      register(b.f, { ...b.body, trackingCode: code }).then((r) => r),
    ];
    try {
      await blockedBy(pid, 2, block);
      await block.query('COMMIT');
    } finally {
      await block.query('ROLLBACK');
      block.release();
    }
    expect((await Promise.all(contenders)).map((r) => r.status).sort()).toEqual(
      [200, 409],
    );
    expect(
      await db.directShipment.count({ where: { trackingCode: code } }),
    ).toBe(1);
  });
  it('rechecks deadline after waiting for the actual hold account lock', async () => {
    const { f, body } = await dispatchable(),
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
    await extendSession(f, p.pickupDeadline);
    const block = await pool.connect();
    await block.query('BEGIN');
    await block.query(
      'SELECT id FROM wallet_accounts WHERE order_id=$1 FOR UPDATE',
      [f.id],
    );
    const pid = (await block.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const contender = register(f, body).then((r) => r);
    try {
      await blockedBy(pid, 1, block);
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
      await block.query('COMMIT');
    } finally {
      await block.query('ROLLBACK');
      block.release();
    }
    expect((await contender).status).toBe(409);
    expect(await db.directShipment.count({ where: { orderId: f.id } })).toBe(0);
  });
  it('rechecks session expiration after waiting for tracking uniqueness', async () => {
    const { f, body } = await dispatchable(),
      block = await pool.connect();
    await block.query('BEGIN');
    await block.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,78301))',
      [`LatLaiSimulator/${body.trackingCode}`],
    );
    const pid = (await block.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const contender = register(f, body).then((r) => r);
    try {
      await blockedBy(pid, 1, block);
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(
        new Date(Date.now() + 2 * 86400000),
      );
      await block.query('COMMIT');
    } finally {
      await block.query('ROLLBACK');
      block.release();
    }
    expect((await contender).status).toBe(401);
    expect(await db.directShipment.count({ where: { orderId: f.id } })).toBe(0);
  });
  it('rechecks revoked role before replay while blocked on user row', async () => {
    const { f, body } = await dispatchable(),
      key = randomUUID();
    await register(f, body, f.f.seller, key).expect(200);
    const block = await blockUser(f.f.seller.id),
      contender = register(f, body, f.f.seller, key).then((r) => r);
    try {
      await blockedBy(block.pid, 1, block.connection);
      await block.connection.query('DELETE FROM user_roles WHERE user_id=$1', [
        f.f.seller.id,
      ]);
      await block.connection.query('COMMIT');
    } finally {
      await block.connection.query('ROLLBACK');
      block.connection.release();
    }
    expect((await contender).status).toBe(403);
  });
  it.each(['DISABLED', 'UNVERIFIED', 'REVOKED'] as const)(
    'denies %s seller receipt replay',
    async (mode) => {
      const { f, body } = await dispatchable(),
        key = randomUUID();
      await register(f, body, f.f.seller, key).expect(200);
      if (mode === 'DISABLED')
        await db.user.update({
          where: { id: f.f.seller.id },
          data: { status: 'DISABLED' },
        });
      else if (mode === 'UNVERIFIED')
        await db.user.update({
          where: { id: f.f.seller.id },
          data: { emailVerifiedAt: null },
        });
      else
        await db.authSession.update({
          where: { id: f.f.seller.sessionId },
          data: { revokedAt: new Date() },
        });
      await register(f, body, f.f.seller, key).expect(401);
      await shipment(f, f.f.seller).expect(401);
    },
  );
  it.each(['audit', 'outbox'] as const)(
    'rolls back registration/photos/receipt on %s failure and allows same-key retry',
    async (stage) => {
      const { f, body } = await dispatchable(),
        key = randomUUID(),
        table = stage === 'audit' ? 'audit_events' : 'outbox_events';
      const condition =
        stage === 'audit'
          ? "NEW.action='registerDirectShipment'"
          : "NEW.type='DirectShipmentRegistered'";
      await pool.query(
        `CREATE FUNCTION fail_shipment_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_shipment_test BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_shipment_test()`,
      );
      try {
        await register(f, body, f.f.seller, key).expect(500);
      } finally {
        await pool.query(
          `DROP TRIGGER fail_shipment_test ON ${table}; DROP FUNCTION fail_shipment_test()`,
        );
      }
      expect(await db.directShipment.count({ where: { orderId: f.id } })).toBe(
        0,
      );
      expect(
        await db.shipmentPackagingEvidence.count({ where: { orderId: f.id } }),
      ).toBe(0);
      expect(
        await db.mutationReceipt.count({
          where: {
            contextId: f.r.contextId,
            operation: 'registerDirectShipment',
          },
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
    for (const sql of [
      'DELETE FROM direct_shipments WHERE id=$1',
      "UPDATE direct_shipments SET tracking_code='LL-12345678' WHERE id=$1",
      "UPDATE direct_shipments SET state='PickedUp' WHERE id=$1",
    ])
      await expect(pool.query(sql, [r.entityId])).rejects.toThrow();
    await expect(
      pool.query(
        'DELETE FROM shipment_packaging_evidence WHERE shipment_id=$1',
        [r.entityId],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        'UPDATE shipment_packaging_evidence SET position=1 WHERE shipment_id=$1',
        [r.entityId],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        'INSERT INTO shipment_packaging_evidence(shipment_id,order_id,evidence_id,position) VALUES ($1,$2,$3,1)',
        [r.entityId, f.id, more.id],
      ),
    ).rejects.toThrow();
    const other = await dispatchable();
    await expect(
      pool.query(
        'INSERT INTO shipment_packaging_evidence(shipment_id,order_id,evidence_id,position) VALUES ($1,$2,$3,1)',
        [r.entityId, other.f.id, other.e.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "INSERT INTO direct_shipments(id,order_id,carrier,tracking_code,origin,destination,shipping_fee,registered_at,receipt_id) SELECT $1,$2,'LatLaiSimulator',$3,origin,destination,shipping_fee,clock_timestamp(),$4 FROM direct_shipments WHERE id=$5",
        [randomUUID(), other.f.id, tracking(), randomUUID(), r.entityId],
      ),
    ).rejects.toThrow();
    expect((await shipment(f)).body.packagingEvidenceIds).toEqual([e.id]);
    expect((await reconcile()).balanced).toBe(true);
  });
});
