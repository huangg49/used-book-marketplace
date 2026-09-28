import { OrderClock } from '../src/modules/orders/order-clock.js';
import { QuoteClock } from '../src/modules/quotes/quote-clock.js';
import { spawn } from 'node:child_process';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { OrderExpiryWorker } from '../src/modules/orders/order-expiry.service.js';
import { ReservationsService } from '../src/modules/reservations/reservations.service.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
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

describe('Unpaid DirectDelivery orders HTTP and PostgreSQL', () => {
  const schema = `order_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
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
    m2 = await reader();
    a1 = await reader(['MEMBER', 'ADMIN']);
    a2 = await reader(['ADMIN']);
    staff = await reader(['STAFF']);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool && /^order_http_test_[a-f0-9]{32}$/.test(schema))
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adapter?.dispose();
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
    const history = await db.auditEvent.findMany({
      where: { contextId: buyer.contextId },
      include: { receipt: true, outbox: true },
    });
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
    await db.userRole.deleteMany({ where: { userId: p.f.buyer.id } });
    await create(p, key).expect(403);
    await db.userRole.create({
      data: { userId: p.f.buyer.id, role: 'MEMBER' },
    });
    await db.authSession.update({
      where: { id: p.f.buyer.sessionId },
      data: { revokedAt: new Date() },
    });
    await cancel(r.entityId, p.f.buyer, ck).expect(401);
  });
  it('Restricted handles old unpaid obligations but cannot create; worker still expires after participants are disabled', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body;
    await db.user.update({
      where: { id: p.f.buyer.id },
      data: { status: 'RESTRICTED' },
    });
    await create(p).expect(403);
    expect((await orderView(r.entityId, p.f.buyer)).canCancel).toBe(true);
    await cancel(r.entityId, p.f.buyer).expect(200);
    const p2 = await prepared(),
      r2 = (await create(p2).expect(200)).body;
    await db.user.update({
      where: { id: p2.f.buyer.id },
      data: { status: 'LOCKED' },
    });
    await db.user.update({
      where: { id: p2.f.seller.id },
      data: { status: 'DISABLED' },
    });
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
        q = await db.saleQuote.findUniqueOrThrow({
          where: { id: p.body.quoteId },
        });
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
    const gate = await blockUser(p.f.seller.id);
    const calls = Array.from({ length: 100 }, (_, i) =>
      create(preparedRequests[i % 5]).then((r) => r),
    );
    try {
      await blockedBy(gate.pid, 2, gate.connection);
      await gate.connection.query('COMMIT');
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
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
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
    const gate = await blockUser(first.f.buyer.id),
      calls = Array.from({ length: 100 }, (_, i) =>
        create(ps[i % 3]).then((r) => r),
      );
    try {
      await blockedBy(gate.pid, 2, gate.connection);
      await gate.connection.query('COMMIT');
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
        await db.directOrder.count({
          where: { buyerId: first.f.buyer.id, state: 'AwaitingPayment' },
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
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
    }
  }, 120000);
  it('same-key contention has one durable receipt and one replay', async () => {
    const p = await prepared(),
      key = randomUUID(),
      gate = await blockUser(p.f.buyer.id);
    const calls = [
      create(p, key).then((r) => r),
      create(p, key).then((r) => r),
    ];
    try {
      await blockedBy(gate.pid, 2, gate.connection);
      await gate.connection.query('COMMIT');
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
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
    }
  });
  it.each(['role', 'hidden', 'address'] as const)(
    'rejects creation when %s mutation wins while waiting',
    async (kind) => {
      const p = await prepared(),
        gate = await blockUser(p.f.seller.id),
        response = create(p).then((r) => r);
      try {
        await blockedBy(gate.pid, 1, gate.connection);
        if (kind === 'role')
          await gate.connection.query(
            "DELETE FROM user_roles WHERE user_id=$1 AND role='MEMBER'",
            [p.f.seller.id],
          );
        else if (kind === 'hidden')
          await gate.connection.query(
            "UPDATE listings SET visibility='Hidden',version=version+1 WHERE id=$1",
            [p.f.l.entityId],
          );
        else
          await gate.connection.query(
            "UPDATE member_addresses SET detail='Updated source' WHERE id=$1",
            [p.f.origin.id],
          );
        await gate.connection.query('COMMIT');
        expect((await response).status).toBe(409);
        expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
      } finally {
        await gate.connection.query('ROLLBACK');
        gate.connection.release();
        await response;
      }
    },
  );
  it('creation wins before a competing lifecycle mutation, which cannot edit a reserved listing', async () => {
    const p = await prepared(),
      gate = await blockUser(p.f.seller.id),
      first = create(p).then((r) => r);
    let second: ReturnType<typeof put> | undefined;
    try {
      await blockedBy(gate.pid, 1, gate.connection);
      second = put(
        p.f.l.entityId,
        { expectedVersion: p.f.l.version, content: p.f.l.content },
        p.f.seller,
      );
      const pendingSecond = second.then((r) => r);
      await blockedBy(gate.pid, 2, gate.connection);
      await gate.connection.query('COMMIT');
      expect((await first).status).toBe(200);
      expect((await pendingSecond).status).toBe(409);
    } finally {
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await first;
    }
  });
  it.each(['buyerRole', 'buyerRestricted', 'sessionRevoked'] as const)(
    'rechecks %s after HTTP authorization while waiting for locks',
    async (kind) => {
      const p = await prepared(),
        gate = await blockUser(p.f.buyer.id),
        call = create(p).then((r) => r);
      try {
        await blockedBy(gate.pid, 1, gate.connection);
        if (kind === 'buyerRole')
          await gate.connection.query(
            "DELETE FROM user_roles WHERE user_id=$1 AND role='MEMBER'",
            [p.f.buyer.id],
          );
        else if (kind === 'buyerRestricted')
          await gate.connection.query(
            "UPDATE users SET status='RESTRICTED' WHERE id=$1",
            [p.f.buyer.id],
          );
        else
          await gate.connection.query(
            'UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',
            [p.f.buyer.sessionId],
          );
        await gate.connection.query('COMMIT');
        expect((await call).status).toBe(kind === 'sessionRevoked' ? 401 : 403);
        expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
      } finally {
        await gate.connection.query('ROLLBACK');
        gate.connection.release();
        await call;
      }
    },
  );
  it('session expiry after a listing lock wait prevents commit', async () => {
    const p = await prepared(),
      gate = await pool.connect();
    await gate.query('BEGIN');
    await gate.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE', [
      p.f.l.entityId,
    ]);
    const pid = (await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid,
      expiresAt = new Date(Date.now() + 60000);
    await db.authSession.update({
      where: { id: p.f.buyer.sessionId },
      data: { expiresAt },
    });
    const clock = vi
        .spyOn(app.get(OrderClock), 'now')
        .mockResolvedValue(expiresAt),
      response = create(p).then((r) => r);
    try {
      await blockedBy(pid, 1, gate);
      expect(clock).not.toHaveBeenCalled();
      await gate.query('COMMIT');
      expect((await response).status).toBe(401);
      expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await response;
      clock.mockRestore();
    }
  });
  it('two expiry commands serialize, survive restart and never release a later reservation', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body,
      gate = await blockUser(p.f.buyer.id);
    const clock = vi
      .spyOn(app.get(OrderClock), 'now')
      .mockResolvedValue(new Date(r.paymentDeadline));
    const calls = [
      app.get(OrdersService).expire(r.entityId),
      app.get(OrdersService).expire(r.entityId),
    ];
    let receipt: unknown;
    try {
      await blockedBy(gate.pid, 2, gate.connection);
      await gate.connection.query('COMMIT');
      const results = await Promise.all(calls);
      expect(results[0].receipt).toEqual(results[1].receipt);
      receipt = results[0].receipt;
      expect((await stateCounts(p.f.l.entityId)).events).toBe(2);
    } finally {
      await gate.connection.query('ROLLBACK');
      gate.connection.release();
      await Promise.all(calls);
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
    await pool.query(
      "CREATE FUNCTION fail_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='expireOrder' THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_expiry BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_expiry()",
    );
    try {
      const result = await app.get(OrderExpiryWorker).tick();
      expect(result.failed).toBeGreaterThan(0);
      expect(result.oldestLagSeconds).toBeGreaterThanOrEqual(121);
      expect((await stateCounts(p.f.l.entityId)).active).toBe(1);
    } finally {
      await pool.query(
        'DROP TRIGGER fail_expiry ON audit_events; DROP FUNCTION fail_expiry()',
      );
      clock.mockRestore();
    }
    await app.close();
    app = await makeApp();
    clock = vi.spyOn(app.get(OrderClock), 'now').mockResolvedValue(deadline);
    try {
      await app.get(OrderExpiryWorker).tick();
      expect((await stateCounts(p.f.l.entityId)).active).toBe(0);
      expect(
        (await db.directOrder.findUniqueOrThrow({ where: { id: r.entityId } }))
          .state,
      ).toBe('PaymentExpired');
    } finally {
      clock.mockRestore();
    }
  });
  it('rejects cross-context release, preserves visibility on closure and prevents Reserved without commitment', async () => {
    const p = await prepared(),
      r = (await create(p).expect(200)).body,
      c = await db.exclusiveCommitment.findFirstOrThrow({
        where: { currentContextId: r.contextId },
      });
    const p2 = await prepared(),
      r2 = (await create(p2).expect(200)).body;
    await expect(
      db.$transaction((tx) =>
        app
          .get(ReservationsService)
          .closeUnpaid(
            tx,
            r2.contextId,
            c.id,
            c.version,
            'Cancelled',
            new Date(),
            randomUUID(),
          ),
      ),
    ).rejects.toBeDefined();
    await pool.query(
      "UPDATE listings SET visibility='Hidden',version=version+1 WHERE id=$1",
      [p.f.l.entityId],
    );
    await cancel(r.entityId, p.f.buyer).expect(200);
    const l = await db.listing.findUniqueOrThrow({
      where: { id: p.f.l.entityId },
    });
    expect(l.visibility).toBe('Hidden');
    expect(l.trade).toBe('Available');
    await expect(
      pool.query(
        "UPDATE listings SET trade='Reserved',version=version+1 WHERE id=$1",
        [l.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        "UPDATE listings SET trade='Available',version=version+1 WHERE id=$1",
        [p2.f.l.entityId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    for (const table of ['workflow_items', 'agreement_snapshots'])
      await expect(
        pool.query(`UPDATE ${table} SET snapshot='{}' WHERE context_id=$1`, [
          r.contextId,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM commitment_events WHERE commitment_id=$1', [
        c.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        "UPDATE exclusive_commitments SET status='Active',version=1,ended_at=NULL,reason=NULL WHERE id=$1",
        [c.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
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
    async (table) => {
      const p = await prepared(),
        key = randomUUID();
      await pool.query(
        `CREATE FUNCTION fail_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failpoint'; END $$; CREATE TRIGGER fail_order BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_order()`,
      );
      try {
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
          (
            await db.listing.findUniqueOrThrow({
              where: { id: p.f.l.entityId },
            })
          ).trade,
        ).toBe('Available');
      } finally {
        await pool.query(
          `DROP TRIGGER fail_order ON ${table}; DROP FUNCTION fail_order()`,
        );
      }
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
        const child = spawn(process.execPath, args, {
          env: {
            ...process.env,
            ORDER_WORKER_TEST_SCHEMA: schema,
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
    expect(
      (await db.directOrder.findUniqueOrThrow({ where: { id: orderId! } }))
        .state,
    ).toBe('PaymentExpired');
    const before = await stateCounts(f.l.entityId);
    await run();
    expect(await stateCounts(f.l.entityId)).toEqual(before);
    expect(before.events).toBe(2);
  }, 60000);
  it.each(['cancel', 'expiry'] as const)(
    'serializes cancel/timeout with %s winning and exactly one release',
    async (winner) => {
      const p = await prepared(),
        r = (await create(p).expect(200)).body,
        gate = await blockUser(p.f.buyer.id);
      const t = Date.parse(r.paymentDeadline),
        clock = vi.spyOn(app.get(OrderClock), 'now');
      clock
        .mockResolvedValueOnce(new Date(winner === 'cancel' ? t - 1 : t))
        .mockResolvedValue(new Date(t));
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
        await blockedBy(gate.pid, 1, gate.connection);
        second = winner === 'cancel' ? expiryCall() : cancelCall();
        await blockedBy(gate.pid, 2, gate.connection);
        await gate.connection.query('COMMIT');
        expect((await first).status).toBe(200);
        expect((await second).status).toBe(409);
        const o = await db.directOrder.findUniqueOrThrow({
          where: { id: r.entityId },
        });
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
        await gate.connection.query('ROLLBACK');
        gate.connection.release();
        await first;
        await second;
        clock.mockRestore();
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
    expect((await db.listing.findUniqueOrThrow({ where: { id } })).trade).toBe(
      'Reserved',
    );
  });
  it('rejects orphan Orders, incomplete context cardinality and duplicate active commitments at the SQL boundary', async () => {
    const p = await prepared(),
      q = await db.saleQuote.findUniqueOrThrow({
        where: { id: p.body.quoteId },
      }),
      now = new Date();
    const data = {
      buyerId: q.buyerId,
      sellerId: q.sellerId,
      quoteId: q.id,
      state: 'AwaitingPayment',
      createdAt: now,
      paymentDeadline: new Date(now.getTime() + 900000),
    };
    await expect(db.directOrder.create({ data })).rejects.toBeDefined();
    await expect(
      db.$transaction(async (tx) => {
        const o = await tx.directOrder.create({ data });
        await tx.workflowContext.create({
          data: { kind: 'Order', orderId: o.id, ownershipPhase: 'Holding' },
        });
      }),
    ).rejects.toBeDefined();
    expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
    const r = (await create(p).expect(200)).body,
      c = await db.exclusiveCommitment.findFirstOrThrow({
        where: { currentContextId: r.contextId },
      });
    await expect(
      db.exclusiveCommitment.create({ data: { ...c, id: randomUUID() } }),
    ).rejects.toBeDefined();
    await expect(
      pool.query('UPDATE workflow_contexts SET order_id=$1 WHERE id=$2', [
        randomUUID(),
        r.contextId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        "INSERT INTO mutation_receipts(id,system_actor,operation,key,payload_hash,context_id,result_version,result) VALUES($1,'FakeWorker','expireOrder',$2,$3,$4,1,'{}')",
        [randomUUID(), randomUUID(), 'f'.repeat(64), r.contextId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('rolls back snapshot and commitment if the listing projection write fails', async () => {
    const p = await prepared(),
      key = randomUUID();
    await pool.query(
      "CREATE FUNCTION fail_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.trade='Reserved' THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_projection BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION fail_projection()",
    );
    try {
      await create(p, key).expect(500);
      expect((await stateCounts(p.f.l.entityId)).orders).toBe(0);
    } finally {
      await pool.query(
        'DROP TRIGGER fail_projection ON listings; DROP FUNCTION fail_projection()',
      );
    }
    await create(p, key).expect(200);
  });
  it('LOCKED participants recover orders/media and buyer cancellation without new-action or operations access', async () => {
    const p = await prepared(),
      key = randomUUID(),
      r = (await create(p, key).expect(200)).body;
    await db.userRole.create({ data: { userId: p.f.buyer.id, role: 'ADMIN' } });
    await db.user.updateMany({
      where: { id: { in: [p.f.buyer.id, p.f.seller.id] } },
      data: { status: 'LOCKED' },
    });
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
    await db.userRole.deleteMany({
      where: { userId: p.f.buyer.id, role: 'MEMBER' },
    });
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
      gate = await blockUser(p.f.buyer.id);
    const call = cancel(r.entityId, p.f.buyer).then((v) => v.status);
    try {
      await blockedBy(gate.pid, 1, gate.connection);
      await gate.connection.query(
        "UPDATE users SET status='LOCKED' WHERE id=$1",
        [p.f.buyer.id],
      );
    } finally {
      await gate.connection.query('COMMIT');
      gate.connection.release();
    }
    expect(await call).toBe(200);
    const late = await prepared(),
      lr = (await create(late).expect(200)).body;
    await db.user.update({
      where: { id: late.f.buyer.id },
      data: { status: 'LOCKED' },
    });
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
        await db.user.update({ where: { id: p.f.buyer.id }, data: { status } });
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
      await db.authSession.update({
        where: { id: p.f.buyer.sessionId },
        data: { revokedAt: new Date() },
      });
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
