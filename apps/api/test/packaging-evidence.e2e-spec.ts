import sharp from 'sharp';
import { digest } from '../src/modules/media/media-storage.js';
import { ImageUploadSlots } from '../src/modules/media/image-upload-slots.js';
import { MediaWorker } from '../src/modules/media/media-worker.service.js';
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

describe('Private packaging evidence: real PostgreSQL, HTTP and Sharp', () => {
  const schema = `packaging_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
  const migration = '20260928040000_order_packaging_evidence';
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
    await pay(legacy).expect(200);
    await accept(legacy).expect(200);
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
    if (pool && /^packaging_http_test_[a-f0-9]{32}$/.test(schema))
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
  const budgetTotal = async () =>
    (await db.listingMedia.aggregate({ _sum: { reservedBytes: true } }))._sum
      .reservedBytes! +
    ((
      await db.orderPackagingEvidence.aggregate({
        _sum: { reservedBytes: true },
      })
    )._sum.reservedBytes ?? 0);
  afterEach(() => {
    storage.afterPut = undefined;
    storage.beforeSign = undefined;
    storage.failCheck = false;
    vi.restoreAllMocks();
    app.get(ConfigService).set('MEDIA_STORAGE_BUDGET_BYTES', 800000000);
  });
  it('upgrades thirteen migrations without changing accepted Orders, reservations or ledger', async () => {
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
    expect(
      await db.auditEvent.count({
        where: { contextId: f.r.contextId, action: 'readPackagingEvidence' },
      }),
    ).toBe(2);
    const after = await orderView(f.id, f.f.buyer);
    expect(after.version).toBe(before.version);
    expect(after.state).toBe('Preparing');
    expect(money.transactionHeld).toBeGreaterThan(0);
    expect((await wallet(f.f.buyer)).transactionHeld).toBe(
      money.transactionHeld,
    );
    expect(
      await db.exclusiveCommitment.count({
        where: { currentContextId: f.r.contextId, status: 'Active' },
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
      await db.user.updateMany({
        where: { id: { in: [f.f.seller.id, f.f.buyer.id] } },
        data: { status },
      });
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
    const p = await db.orderPreparation.findUniqueOrThrow({
      where: { orderId: f.id },
    });
    await db.authSession.updateMany({
      where: { id: { in: [f.f.seller.sessionId, f.f.buyer.sessionId] } },
      data: { expiresAt: new Date(p.pickupDeadline.getTime() + 86400000) },
    });
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    await app.get(OrdersService).expirePickup(f.id);
    await upload(f, e.id, e.bytes).expect(200);
    const m = await db.orderPackagingEvidence.findUniqueOrThrow({
      where: { id: e.id },
    });
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
    expect(
      await db.auditEvent.count({
        where: { contextId: f.r.contextId, action: 'uploadPackagingEvidence' },
      }),
    ).toBe(1);
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
      if (path.endsWith('.webp'))
        await db.user.update({
          where: { id: f.f.seller.id },
          data: { status: 'DISABLED' },
        });
    };
    await upload(f, e.id, e.bytes, f.f.seller, key).expect(401);
    expect(
      (
        await db.orderPackagingEvidence.findUniqueOrThrow({
          where: { id: e.id },
        })
      ).status,
    ).toBe('Pending');
    storage.afterPut = undefined;
    await db.user.update({
      where: { id: f.f.seller.id },
      data: { status: 'ACTIVE' },
    });
    await upload(f, e.id, e.bytes, f.f.seller, key).expect(200);
  });
  it('does not issue a preview or successful read audit when participant access changes during signing', async () => {
    const f = await accepted(),
      e = await reserved(f);
    await upload(f, e.id, e.bytes).expect(200);
    storage.beforeSign = async () => {
      await db.user.update({
        where: { id: f.f.buyer.id },
        data: { status: 'DISABLED' },
      });
    };
    await preview(f, e.id).expect(401);
    expect(
      await db.auditEvent.count({
        where: { contextId: f.r.contextId, action: 'readPackagingEvidence' },
      }),
    ).toBe(0);
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
    await pool.query(
      `CREATE FUNCTION packaging_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='uploadPackagingEvidence' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER packaging_test_fail BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION packaging_fail_audit()`,
    );
    try {
      await upload(f, e.id, e.bytes, f.f.seller, key).expect(500);
    } finally {
      await pool.query(
        'DROP TRIGGER packaging_test_fail ON audit_events; DROP FUNCTION packaging_fail_audit()',
      );
    }
    expect(
      (
        await db.orderPackagingEvidence.findUniqueOrThrow({
          where: { id: e.id },
        })
      ).status,
    ).toBe('Pending');
    expect(
      await db.mutationReceipt.count({
        where: {
          actorId: f.f.seller.id,
          operation: 'uploadPackagingEvidence',
          key,
        },
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
      await db.orderPackagingEvidence.count({ where: { orderId: f.id } }),
    ).toBe(1);
  });
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
    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT pg_advisory_xact_lock(781204991)');
    const pid = (await blocker.query('SELECT pg_backend_pid() pid')).rows[0]
      .pid;
    const contenders = [
      intent(f, bytes).then((r) => r),
      intent(g, bytes).then((r) => r),
    ];
    try {
      await blockedBy(pid, 2, blocker);
      await blocker.query('COMMIT');
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
    expect((await Promise.all(contenders)).map((r) => r.status).sort()).toEqual(
      [200, 429],
    );
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
    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT pg_advisory_xact_lock(781204991)');
    const pid = (await blocker.query('SELECT pg_backend_pid() pid')).rows[0]
      .pid;
    const contender = intent(f, bytes).then((r) => r);
    try {
      await blockedBy(pid, 1, blocker);
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(
        new Date(Date.now() + 2 * 86400000),
      );
      await blocker.query('COMMIT');
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
    expect((await contender).status).toBe(401);
    expect(
      await db.orderPackagingEvidence.count({ where: { orderId: f.id } }),
    ).toBe(0);
  });
  it('rechecks role changes while waiting for the participant lock, even on receipt replay', async () => {
    const f = await accepted(),
      bytes = await image(),
      key = randomUUID();
    await intent(f, bytes, f.f.seller, key).expect(200);
    const { connection, pid } = await blockUser(f.f.seller.id);
    const contender = intent(f, bytes, f.f.seller, key).then((r) => r);
    try {
      await blockedBy(pid, 1, connection);
      await connection.query('DELETE FROM user_roles WHERE user_id=$1', [
        f.f.seller.id,
      ]);
      await connection.query('COMMIT');
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
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
  });
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
  });
  it('allows accepted evidence submission racing pickup expiry without moving money or reopening the Order', async () => {
    const f = await accepted(),
      e = await reserved(f);
    const p = await db.orderPreparation.findUniqueOrThrow({
      where: { orderId: f.id },
    });
    await db.authSession.update({
      where: { id: f.f.seller.sessionId },
      data: { expiresAt: new Date(p.pickupDeadline.getTime() + 86400000) },
    });
    // Network barrier: expiry commits while upload holds no database lock.
    storage.afterPut = async (key) => {
      if (!key.endsWith('.webp')) return;
      vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
      await app.get(OrdersService).expirePickup(f.id);
    };
    await upload(f, e.id, e.bytes).expect(200);
    expect(
      (await db.directOrder.findUniqueOrThrow({ where: { id: f.id } })).state,
    ).toBe('ResolutionPending');
    expect(
      (
        await db.orderPackagingEvidence.findUniqueOrThrow({
          where: { id: e.id },
        })
      ).status,
    ).toBe('Ready');
    expect((await reconcile()).balanced).toBe(true);
  });
  it('keeps submitted evidence when expiry happens after its acknowledgement', async () => {
    const f = await accepted(),
      e = await reserved(f);
    await upload(f, e.id, e.bytes).expect(200);
    const before = await db.orderPackagingEvidence.findUniqueOrThrow({
      where: { id: e.id },
    });
    const p = await db.orderPreparation.findUniqueOrThrow({
      where: { orderId: f.id },
    });
    vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(p.pickupDeadline);
    await app.get(OrdersService).expirePickup(f.id);
    expect(
      await db.orderPackagingEvidence.findUniqueOrThrow({
        where: { id: e.id },
      }),
    ).toEqual(before);
    expect(
      (await db.directOrder.findUniqueOrThrow({ where: { id: f.id } })).state,
    ).toBe('ResolutionPending');
    expect((await reconcile()).balanced).toBe(true);
  });
  it('does not replay evidence receipts to revoked or unverified accounts', async () => {
    const f = await accepted(),
      bytes = await image(),
      key = randomUUID();
    await intent(f, bytes, f.f.seller, key).expect(200);
    await db.user.update({
      where: { id: f.f.seller.id },
      data: { emailVerifiedAt: null },
    });
    await intent(f, bytes, f.f.seller, key).expect(401);
    await db.user.update({
      where: { id: f.f.seller.id },
      data: { emailVerifiedAt: new Date() },
    });
    await db.authSession.update({
      where: { id: f.f.seller.sessionId },
      data: { revokedAt: new Date() },
    });
    await intent(f, bytes, f.f.seller, key).expect(401);
  });
  it('SQL guards reject deletion, original edits, forged Ready and forged intent without receipts', async () => {
    const f = await accepted(),
      e = await reserved(f);
    await expect(
      pool.query('DELETE FROM order_packaging_evidence WHERE id=$1', [e.id]),
    ).rejects.toThrow();
    await expect(
      pool.query('UPDATE order_packaging_evidence SET sha256=$2 WHERE id=$1', [
        e.id,
        'b'.repeat(64),
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "UPDATE order_packaging_evidence SET status='Ready',version=2 WHERE id=$1",
        [e.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "INSERT INTO order_packaging_evidence(id,order_id,mime_type,byte_size,sha256,reserved_bytes,created_at,create_receipt_id) VALUES ($1,$2,'image/png',1,$3,2000001,clock_timestamp(),$4)",
        [randomUUID(), f.id, 'f'.repeat(64), randomUUID()],
      ),
    ).rejects.toThrow();
    await upload(f, e.id, e.bytes).expect(200);
    await expect(
      pool.query('UPDATE order_packaging_evidence SET width=12 WHERE id=$1', [
        e.id,
      ]),
    ).rejects.toThrow();
    expect((await reconcile()).balanced).toBe(true);
  });
});
