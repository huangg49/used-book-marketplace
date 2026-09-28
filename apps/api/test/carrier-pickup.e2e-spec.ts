import sharp from 'sharp';
import { digest } from '../src/modules/media/media-storage.js';

import { OrderClock } from '../src/modules/orders/order-clock.js';
import { LedgerService } from '../src/modules/wallet/ledger.service.js';

import { OrdersService } from '../src/modules/orders/orders.service.js';
import { CarrierSimulator } from '../src/modules/shipments/carrier-simulator.js';
import { ShipmentsService } from '../src/modules/shipments/shipments.service.js';
import { OrderExpiryWorker } from '../src/modules/orders/order-expiry.service.js';
import { canonicalJson } from '../src/modules/commands/command.service.js';
import { createHmac } from 'node:crypto';
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

describe('Carrier pickup: real PostgreSQL and HTTP', () => {
  const schema = `pickup_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
  const migration = '20260928060000_carrier_pickup';
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
    const snapshot = async () => {
      const rows: Record<string, unknown> = {};
      for (const table of [
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
    if (pool && /^pickup_http_test_[a-f0-9]{32}$/.test(schema))
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
  const history = (f: PaymentFixture, actor = f.f.buyer) =>
    get(`/me/orders/${f.id}/shipment/pickup-events`, actor);
  it('upgrades fifteen migrations without rewriting labels, money, evidence or receipts', async () => {
    expect(upgradeAfter).toEqual(upgradeBefore);
    expect((await shipment(legacy).expect(200)).body.pickup).toBeNull();
    expect((await reconcile()).balanced).toBe(true);
  });
  it('confirms authenticated timely pickup, pins factual time and retains full money and stock', async () => {
    const { f, event } = await labelled(),
      money = await wallet(f.f.buyer);
    const before = await db.directShipment.findUnique({
      where: { id: event.shipmentId },
    });
    const r = await emit(event).expect(200);
    validates('CarrierEventReceipt', r.body);
    expect(r.body).toMatchObject({
      entityType: 'CarrierEvent',
      entityId: event.eventId,
      version: 1,
      outcome: 'Applied',
      orderState: 'InTransit',
      orderVersion: 4,
    });
    expect(await wallet(f.f.buyer)).toMatchObject({
      available: money.available,
      transactionHeld: money.transactionHeld,
      total: money.total,
    });
    expect(
      await db.directShipment.findUnique({ where: { id: event.shipmentId } }),
    ).toEqual(before);
    const o = await orderView(f.id, f.f.seller);
    expect(o).toMatchObject({
      state: 'InTransit',
      version: 4,
      carrierReview: null,
      shipmentRegistrationEnabled: false,
      moneyHeld: 230000,
      commitment: { status: 'Active' },
    });
    const view = (await shipment(f).expect(200)).body;
    validates('PrivateDirectShipment', view);
    expect(view).toMatchObject({
      state: 'PickedUp',
      version: 2,
      pickupConfirmed: true,
      origin: null,
      carrierReview: null,
      pickup: { eventId: event.eventId, occurredAt: event.occurredAt },
    });
    expect(view.pickup.deliveryDeadline).toBe(
      new Date(Date.parse(event.occurredAt) + 240 * 3600000).toISOString(),
    );
    const h = (await history(f).expect(200)).body;
    validates('PickupEventList', h);
    expect(Object.keys(h.items[0]).sort()).toEqual(
      ['id', 'sequence', 'occurredAt', 'receivedAt', 'outcome'].sort(),
    );
    const listed = (
      await get('/me/orders?state=InTransit', f.f.buyer).expect(200)
    ).body;
    expect(JSON.stringify(listed)).toContain(f.id);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('denies guests, members and generic staff/admin operators', async () => {
    const { event } = await labelled();
    await request(app.getHttpServer())
      .post('/api/v1/operations/simulator/pickup-events')
      .send(event)
      .expect(401);
    for (const actor of [m1, a1, a2, staff])
      await emit(event, actor).expect(403);
  });
  it.each(['buyer', 'seller'] as const)(
    'a participant with TEST_OPERATOR role cannot certify their own %s transaction',
    async (side) => {
      const { f, event } = await labelled(),
        actor = f.f[side];
      await db.userRole.create({
        data: { userId: actor.id, role: 'TEST_OPERATOR' },
      });
      await emit(event, actor).expect(403);
      expect(
        await db.carrierPickupEvent.count({ where: { orderId: f.id } }),
      ).toBe(0);
    },
  );
  it.each(['LOCKED', 'RESTRICTED'] as const)(
    'denies %s operator while permitting their participants existing-obligation reads',
    async (status) => {
      const { f, event } = await labelled(),
        op = await reader(['TEST_OPERATOR'], status);
      await emit(event, op).expect(403);
      await db.user.updateMany({
        where: { id: { in: [f.f.buyer.id, f.f.seller.id] } },
        data: { status },
      });
      await emit(event).expect(200);
      for (const actor of [f.f.buyer, f.f.seller]) {
        await history(f, actor).expect(200);
        await shipment(f, actor).expect(200);
        await orderView(f.id, actor);
      }
    },
  );
  it('denies history to outsiders, operators, admin and unknown Orders', async () => {
    const { f, event } = await labelled();
    await emit(event).expect(200);
    await history(f).expect(200);
    await get(`/me/orders/${f.id}/shipment/pickup-events`).expect(401);
    for (const actor of [m1, a1]) await history(f, actor).expect(404);
    for (const actor of [operator, staff, a2])
      await history(f, actor).expect(403);
    await get(
      `/me/orders/${randomUUID()}/shipment/pickup-events`,
      f.f.buyer,
    ).expect(404);
  });
  it('requires exact shipment/order/tracking binding and a registered label', async () => {
    const { event } = await labelled();
    for (const patch of [
      { shipmentId: randomUUID() },
      { orderId: randomUUID() },
      { trackingCode: tracking() },
    ])
      await emit({ ...event, ...patch }).expect(404);
    for (const patch of [
      { type: 'Delivered' },
      { carrier: 'RealCarrier' },
      { occurredAt: 'invalid' },
      { fee: 1000 },
      { eventId: 'invalid' },
    ])
      await post(
        '/operations/simulator/pickup-events',
        { ...event, ...patch },
        operator,
        event.eventId,
      ).expect(422);
    await emit(event, operator, randomUUID()).expect(422);
    expect(
      await db.carrierPickupEvent.count({
        where: { shipmentId: event.shipmentId },
      }),
    ).toBe(0);
  });
  it('rejects event before registration and in the future with no writes', async () => {
    const { event } = await labelled(),
      s = await db.directShipment.findUniqueOrThrow({
        where: { id: event.shipmentId },
      });
    for (const time of [
      new Date(s.registeredAt.getTime() - 1),
      new Date(Date.now() + 60000),
    ])
      await emit({ ...event, occurredAt: time.toISOString() }).expect(422);
    await emit(event).expect(200);
  });
  it('validates HMAC and rejects payment protocol signatures, tampering and disabled simulation', async () => {
    const { event } = await labelled(),
      adapter = app.get(CarrierSimulator),
      service = app.get(ShipmentsService);
    const auth = {
      user: { id: operator.id },
      sessionId: operator.sessionId,
    } as Parameters<typeof service.ingest>[0]['auth'];
    const ctx = { auth, key: event.eventId, requestId: randomUUID() };
    const wrongDomain = createHmac(
      'sha256',
      process.env.PAYMENT_SIMULATOR_SECRET!,
    )
      .update('LatLaiSimulator-v1\n' + canonicalJson(event))
      .digest('hex');
    for (const sig of ['bad', 'a'.repeat(64), wrongDomain])
      expect(() => service.ingest(ctx, event, sig)).toThrow();
    const signed = adapter.sign(event);
    expect(() =>
      adapter.verify({ ...event, trackingCode: tracking() }, signed),
    ).toThrow();
    const enabledSecret = app
      .get(ConfigService)
      .get<string>('PAYMENT_SIMULATOR_SECRET');
    app.get(ConfigService).set('PAYMENT_SIMULATOR_SECRET', '');
    try {
      await emit(event).expect(503);
    } finally {
      app.get(ConfigService).set('PAYMENT_SIMULATOR_SECRET', enabledSecret);
    }
    await emit(event).expect(200);
  });
  it('global event replay across independent operators returns one historical receipt after restart', async () => {
    const { event } = await labelled(),
      op2 = await reader(['TEST_OPERATOR']);
    const first = await emit(event).expect(200);
    await app.close();
    app = await makeApp();
    for (const actor of [operator, op2]) {
      const replay = await emit(event, actor).expect(200);
      expect(replay.body).toEqual(first.body);
      expect(replay.headers['idempotency-replayed']).toBe('true');
    }
    const changed = {
      ...event,
      occurredAt: new Date(Date.parse(event.occurredAt) + 1).toISOString(),
    };
    expect((await emit(changed, op2).expect(409)).body.code).toBe(
      'IdempotencyConflict',
    );
    expect(
      await db.mutationReceipt.count({
        where: { operation: 'emitSimulatedPickupEvent', key: event.eventId },
      }),
    ).toBe(1);
  });
  it('new event ID with same factual time is an immutable duplicate without another state transition', async () => {
    const { f, event } = await labelled();
    await emit(event).expect(200);
    const r = await emit({ ...event, eventId: randomUUID() }).expect(200);
    expect(r.body).toMatchObject({
      version: 2,
      outcome: 'Duplicate',
      orderVersion: 4,
      orderState: 'InTransit',
    });
    expect((await history(f).expect(200)).body.items).toHaveLength(2);
    expect(
      await db.carrierPickupReview.count({ where: { orderId: f.id } }),
    ).toBe(0);
  });
  it('conflicting factual time opens sticky review without overwriting canonical pickup or releasing anything', async () => {
    const { f, event } = await labelled(),
      first = await emit(event).expect(200);
    const changed = {
      ...event,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    expect(changed.occurredAt).not.toBe(event.occurredAt);
    const r = await emit(changed).expect(200);
    expect(r.body).toMatchObject({
      outcome: 'ReviewRequired',
      orderState: 'ResolutionPending',
      orderVersion: 5,
    });
    const view = (await shipment(f).expect(200)).body;
    expect(view).toMatchObject({
      pickupConfirmed: true,
      pickup: { eventId: event.eventId },
      carrierReview: { reason: 'ConflictingPickup', status: 'Open' },
    });
    const duplicate = await emit({ ...event, eventId: randomUUID() }).expect(
      200,
    );
    expect(duplicate.body).toMatchObject({
      outcome: 'Duplicate',
      orderState: 'ResolutionPending',
      orderVersion: 5,
    });
    expect((await emit(event).expect(200)).body).toEqual(first.body);
    expect((await orderView(f.id, f.f.buyer)).moneyHeld).toBe(230000);
    expect(
      await db.carrierPickupReview.count({ where: { orderId: f.id } }),
    ).toBe(1);
    await expect(app.get(OrdersService).refund(f.id)).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
  it.each([false, true])(
    'late event opens review and never backdates acceptance; worker already ran=%s',
    async (workerFirst) => {
      const { f, event } = await labelled(),
        p = await db.orderPreparation.findUniqueOrThrow({
          where: { orderId: f.id },
        });
      await freeze(f, p.pickupDeadline);
      if (workerFirst) await app.get(OrdersService).expirePickup(f.id);
      const r = await emit(event).expect(200);
      expect(r.body).toMatchObject({
        outcome: 'ReviewRequired',
        orderState: 'ResolutionPending',
        orderVersion: 4,
      });
      expect((await shipment(f).expect(200)).body).toMatchObject({
        state: 'LabelCreated',
        pickupConfirmed: false,
        pickup: null,
        carrierReview: { reason: 'LatePickup' },
      });
      const o = await orderView(f.id, f.f.buyer);
      expect(o.moneyHeld).toBe(230000);
      expect(!!o.preparation.pickupReview).toBe(workerFirst);
      const status = await app.get(OrderExpiryWorker).tick();
      expect(status.openCarrierReviews).toBeGreaterThan(0);
      expect((await reconcile()).balanced).toBe(true);
    },
  );
  it('last millisecond before pickup deadline is accepted and timeout worker cannot override InTransit', async () => {
    const { f, event } = await labelled(),
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
    await freeze(f, new Date(p.pickupDeadline.getTime() - 1));
    expect((await emit(event).expect(200)).body.outcome).toBe('Applied');
    vi.mocked(app.get(OrderClock).now).mockResolvedValue(p.pickupDeadline);
    await expect(app.get(OrdersService).expirePickup(f.id)).rejects.toThrow();
    expect((await orderView(f.id, f.f.buyer)).state).toBe('InTransit');
  });
  it('20 simultaneous replays across two operators create exactly one event and receipt', async () => {
    const { event } = await labelled(),
      op2 = await reader(['TEST_OPERATOR']);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => emit(event, i % 2 ? operator : op2)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(
      results.filter((r) => r.headers['idempotency-replayed'] === 'false'),
    ).toHaveLength(1);
    expect(
      await db.carrierPickupEvent.count({
        where: { shipmentId: event.shipmentId },
      }),
    ).toBe(1);
  });
  it('different events racing behind a real participant lock serialize one Applied and one Duplicate', async () => {
    const { f, event } = await labelled(),
      lock = await blockUser(f.f.buyer.id);
    const a = emit(event).then((r) => r),
      b = emit({ ...event, eventId: randomUUID() }).then((r) => r);
    try {
      await blockedBy(lock.pid, 2, lock.connection);
    } finally {
      await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
    const results = await Promise.all([a, b]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.map((r) => r.body.outcome).sort()).toEqual([
      'Applied',
      'Duplicate',
    ]);
  });
  it('conflicting events racing serialize an Applied fact and a sticky review', async () => {
    const { f, event } = await labelled(),
      lock = await blockUser(f.f.buyer.id);
    const a = emit(event).then((r) => r),
      b = emit({
        ...event,
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
      }).then((r) => r);
    try {
      await blockedBy(lock.pid, 2, lock.connection);
    } finally {
      await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
    const results = await Promise.all([a, b]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.map((r) => r.body.outcome).sort()).toEqual([
      'Applied',
      'ReviewRequired',
    ]);
    expect((await orderView(f.id, f.f.buyer)).state).toBe('ResolutionPending');
  });
  it('rechecks deadline after waiting on the actual hold account lock', async () => {
    const { f, event } = await labelled(),
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
    await freeze(f, new Date(p.pickupDeadline.getTime() - 1));
    const lock = await pool.connect();
    await lock.query('BEGIN');
    const pid = (await lock.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    await lock.query(
      'SELECT id FROM wallet_accounts WHERE order_id=$1  FOR UPDATE',
      [f.id],
    );
    const pending = emit(event).then((r) => r);
    try {
      await blockedBy(pid, 1, lock);
      vi.mocked(app.get(OrderClock).now).mockResolvedValue(p.pickupDeadline);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
    }
    const r = await pending;
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe('ReviewRequired');
  });
  it('revoked operator role is rechecked before accessing an existing global receipt', async () => {
    const { event } = await labelled(),
      op2 = await reader(['TEST_OPERATOR']);
    await emit(event).expect(200);
    const lock = await blockUser(op2.id),
      pending = emit(event, op2).then((r) => r);
    try {
      await blockedBy(lock.pid, 1, lock.connection);
      await lock.connection.query(
        "DELETE FROM user_roles WHERE user_id=$1 AND role='TEST_OPERATOR'",
        [op2.id],
      );
      await lock.connection.query('COMMIT');
    } finally {
      await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
    expect((await pending).status).toBe(403);
  });
  it.each(['audit', 'outbox'] as const)(
    'rolls back event, Order transition and receipt on %s failure; same-key retry succeeds',
    async (stage) => {
      const { f, event } = await labelled(),
        table = stage === 'audit' ? 'audit_events' : 'outbox_events',
        condition =
          stage === 'audit'
            ? "NEW.action='emitSimulatedPickupEvent'"
            : "NEW.type='CarrierPickupRecorded'";
      await pool.query(
        `CREATE FUNCTION fail_pickup_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_pickup_test BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_pickup_test()`,
      );
      try {
        await emit(event).expect(500);
      } finally {
        await pool.query(
          `DROP TRIGGER fail_pickup_test ON ${table}; DROP FUNCTION fail_pickup_test()`,
        );
      }
      expect(
        await db.carrierPickupEvent.count({ where: { orderId: f.id } }),
      ).toBe(0);
      expect((await orderView(f.id, f.f.buyer)).state).toBe('Preparing');
      expect(
        await db.mutationReceipt.count({ where: { key: event.eventId } }),
      ).toBe(0);
      await emit(event).expect(200);
    },
  );
  it('database rejects fictional InTransit, event deletion/editing, and changed review evidence', async () => {
    const { f, event } = await labelled();
    await expect(
      pool.query(
        "UPDATE direct_orders SET state='InTransit',version=4 WHERE id=$1",
        [f.id],
      ),
    ).rejects.toThrow();
    await emit(event).expect(200);
    for (const sql of [
      "UPDATE carrier_pickup_events SET outcome='Duplicate' WHERE id=$1",
      'DELETE FROM carrier_pickup_events WHERE id=$1',
    ])
      await expect(pool.query(sql, [event.eventId])).rejects.toThrow();
    await emit({
      ...event,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
    }).expect(200);
    for (const sql of [
      "UPDATE carrier_pickup_reviews SET reason='LatePickup' WHERE order_id=$1",
      'DELETE FROM carrier_pickup_reviews WHERE order_id=$1',
    ])
      await expect(pool.query(sql, [f.id])).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
  it('pickup and expiry racing at deadline retain both facts safely with one Order transition', async () => {
    const { f, event } = await labelled(),
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
    await freeze(f, p.pickupDeadline);
    const lock = await blockUser(f.f.buyer.id);
    const incoming = emit(event).then((r) => r),
      expiry = app
        .get(OrdersService)
        .expirePickup(f.id)
        .catch((e) => e);
    try {
      await blockedBy(lock.pid, 2, lock.connection);
    } finally {
      await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
    expect((await incoming).status).toBe(200);
    await expiry;
    expect(
      await db.directOrder.findUnique({ where: { id: f.id } }),
    ).toMatchObject({ state: 'ResolutionPending', version: 4 });
    expect(
      await db.carrierPickupReview.count({ where: { orderId: f.id } }),
    ).toBe(1);
    expect((await reconcile()).balanced).toBe(true);
  });
  it('session expiry after ledger wait rejects even an otherwise valid event', async () => {
    const { f, event } = await labelled(),
      op2 = await reader(['TEST_OPERATOR']);
    const lock = await pool.connect();
    await lock.query('BEGIN');
    const pid = (await lock.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const session = await db.authSession.findUniqueOrThrow({
      where: { id: op2.sessionId },
    });
    const pending = (async () => {
      await lock.query(
        'SELECT id FROM wallet_accounts WHERE order_id=$1 FOR UPDATE',
        [f.id],
      );
      return emit(event, op2);
    })();
    try {
      await blockedBy(pid, 1, lock);
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(session.expiresAt);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
    }
    expect((await pending).status).toBe(401);
    expect(
      await db.carrierPickupEvent.count({ where: { orderId: f.id } }),
    ).toBe(0);
  });
  it('late review and state both roll back if receipt persistence fails', async () => {
    const { f, event } = await labelled(),
      p = await db.orderPreparation.findUniqueOrThrow({
        where: { orderId: f.id },
      });
    await freeze(f, p.pickupDeadline);
    await pool.query(
      `CREATE FUNCTION fail_late_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='emitSimulatedPickupEvent' THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_late_test BEFORE INSERT ON mutation_receipts FOR EACH ROW EXECUTE FUNCTION fail_late_test()`,
    );
    try {
      await emit(event).expect(500);
    } finally {
      await pool.query(
        'DROP TRIGGER fail_late_test ON mutation_receipts; DROP FUNCTION fail_late_test()',
      );
    }
    expect(
      await db.carrierPickupReview.count({ where: { orderId: f.id } }),
    ).toBe(0);
    expect(
      await db.carrierPickupEvent.count({ where: { orderId: f.id } }),
    ).toBe(0);
    expect(
      await db.directOrder.findUnique({ where: { id: f.id } }),
    ).toMatchObject({ state: 'Preparing', version: 3 });
    await emit(event).expect(200);
  });
  it('database blocks forged events with an unrelated receipt and cross-Order review evidence', async () => {
    const one = await labelled(),
      two = await labelled();
    await expect(
      db.carrierPickupEvent.create({
        data: {
          id: randomUUID(),
          orderId: one.f.id,
          shipmentId: one.event.shipmentId,
          sequence: 1,
          occurredAt: new Date(one.event.occurredAt),
          receivedAt: new Date(),
          outcome: 'Applied',
          deliveryDeadline: new Date(
            Date.parse(one.event.occurredAt) + 240 * 3600000,
          ),
          payloadHash: 'a'.repeat(64),
          signature: 'b'.repeat(64),
          receiptId: two.s.id,
        },
      }),
    ).rejects.toThrow();
    await emit(one.event).expect(200);
    await expect(
      db.carrierPickupReview.create({
        data: {
          orderId: two.f.id,
          eventId: one.event.eventId,
          openedAt: new Date(),
          reason: 'LatePickup',
        },
      }),
    ).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
  it('bounds retained history at 128 while allowing receipt replay at capacity', async () => {
    const { f, event } = await labelled(),
      first = await emit(event).expect(200);
    for (let i = 1; i < 128; i++)
      await emit({ ...event, eventId: randomUUID() }).expect(200);
    await emit({ ...event, eventId: randomUUID() }).expect(429);
    expect((await emit(event).expect(200)).body).toEqual(first.body);
    expect((await history(f).expect(200)).body.items).toHaveLength(128);
    expect((await reconcile()).balanced).toBe(true);
  }, 60000);
});
