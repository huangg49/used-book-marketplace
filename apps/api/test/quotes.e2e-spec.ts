import { QuoteClock } from '../src/modules/quotes/quote-clock.js';
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

describe('DirectDelivery quote HTTP and PostgreSQL', () => {
  const schema = `quote_http_test_${randomUUID().replaceAll('-', '')}`;
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
  async function blockedBy(pid: number, minimum = 1) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const r = await pool.query(
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
    if (pool && /^quote_http_test_[a-f0-9]{32}$/.test(schema))
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
  async function pending(actor = m1, confirmed = true) {
    const l = await complete(actor, confirmed);
    const result = await submit(l, actor).expect(200);
    return { ...l, ...result.body };
  }
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
          address: addressInput,
          makeDefault: false,
        },
        owner,
      ).expect(200)
    ).body;
    return { id: saved.addressId, version: 1 };
  }
  async function setup(price = 200000) {
    const seller = await reader(),
      buyer = await reader(),
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
  async function readQuote(id: string, buyer: Reader) {
    const r = await get(`/me/quotes/${id}`, buyer).expect(200);
    validates('SaleQuote', r.body);
    return r.body;
  }
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
  it('quotes server-calculated money, private versions and five-minute expiry without reserving or changing the listing', async () => {
    const f = await setup(),
      before = await db.listing.findUniqueOrThrow({
        where: { id: f.l.entityId },
      });
    const r = await quote(f).expect(200);
    validates('QuoteReceipt', r.body);
    expect(r.headers['cache-control']).toContain('no-store');
    const q = await readQuote(r.body.entityId, f.buyer);
    expect(q.amounts).toEqual({
      bookPrice: 200000,
      shippingFee: 30000,
      buyerTotal: 230000,
      commissionBps: 500,
      commission: 10000,
      sellerProceedsOnCompletion: 220000,
    });
    expect(q.assessment).toBe('Current');
    expect(q.reservesBook).toBe(false);
    expect(q.shippingPayer).toBe('Buyer');
    expect(q.shippingAdvancedBy).toBe('Seller');
    expect(Date.parse(q.expiresAt) - Date.parse(q.createdAt)).toBe(300000);
    expect(r.body.serverTime).toBe(q.createdAt);
    expect(
      await db.listing.findUniqueOrThrow({ where: { id: f.l.entityId } }),
    ).toEqual(before);
    expect(
      (await get(`/listings/${f.l.entityId}`).expect(200)).body.version,
    ).toBe(before.version);
    for (const secret of [
      addressInput.recipientName,
      addressInput.phone,
      addressInput.detail,
      f.origin.id,
    ])
      expect(JSON.stringify(q)).not.toContain(secret);
    const receipts = await db.mutationReceipt.findMany({
        where: { quoteId: q.id },
      }),
      audits = await db.auditEvent.findMany({ where: { quoteId: q.id } });
    expect(receipts).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(
      await db.outboxEvent.count({ where: { audit: { quoteId: q.id } } }),
    ).toBe(0);
    for (const secret of [
      addressInput.recipientName,
      addressInput.phone,
      addressInput.detail,
    ])
      expect(JSON.stringify([receipts, audits])).not.toContain(secret);
  });
  it('does not trust client money/method/version; foreign destination and self purchase fail without side effects', async () => {
    const f = await setup();
    await quote(f, randomUUID(), { ...f.body, bookPrice: 1 } as any).expect(
      422,
    );
    await quote(f, randomUUID(), { ...f.body, method: 'ViaPoint' }).expect(422);
    await quote(f, randomUUID(), {
      ...f.body,
      expectedListingVersion: f.body.expectedListingVersion - 1,
    }).expect(409);
    await quote(f, randomUUID(), {
      ...f.body,
      expectedListingRevisionId: randomUUID(),
    }).expect(409);
    await quote(f, randomUUID(), {
      ...f.body,
      expectedDestinationAddressVersion: 2,
    }).expect(409);
    await quote(f, randomUUID(), {
      ...f.body,
      destinationAddressId: f.origin.id,
    }).expect(404);
    await quote(f, randomUUID(), f.body, f.seller).expect(403);
    expect(
      await db.saleQuote.count({ where: { listingId: f.l.entityId } }),
    ).toBe(0);
  });
  it('allows buyer only; rejects guest/staff/foreign reads and new quotes from Restricted/Locked/roleless users', async () => {
    const f = await setup(),
      r = (await quote(f).expect(200)).body;
    await get(`/me/quotes/${r.entityId}`).expect(401);
    await get(`/me/quotes/${r.entityId}`, staff).expect(403);
    await get(`/me/quotes/${r.entityId}`, f.seller).expect(404);
    await get(`/me/quotes/${r.entityId}`, m2).expect(404);
    await db.user.update({
      where: { id: f.buyer.id },
      data: { status: 'RESTRICTED' },
    });
    expect((await readQuote(r.entityId, f.buyer)).assessment).toBe(
      'Unavailable',
    );
    await quote(f).expect(403);
    await db.user.update({
      where: { id: f.buyer.id },
      data: { status: 'LOCKED' },
    });
    await get(`/me/quotes/${r.entityId}`, f.buyer).expect(403);
    await quote(f).expect(403);
    await db.user.update({
      where: { id: f.buyer.id },
      data: { status: 'ACTIVE' },
    });
    await db.userRole.deleteMany({ where: { userId: f.buyer.id } });
    await get(`/me/quotes/${r.entityId}`, f.buyer).expect(403);
  });
  it('replays stable receipts after deletion/expiry, rejects changed payload keys, and still rechecks session/roles', async () => {
    const f = await setup(),
      key = randomUUID(),
      r = (await quote(f, key).expect(200)).body;
    await mutateAddress(f.buyer, f.destination.id, true);
    await mutateAddress(f.seller, f.origin.id, true);
    expect((await quote(f, key).expect(200)).body).toEqual(r);
    await quote(f, key, { ...f.body, expectedListingVersion: 99 }).expect(409);
    const row = await db.saleQuote.findUniqueOrThrow({
        where: { id: r.entityId },
      }),
      clock = vi
        .spyOn(app.get(QuoteClock), 'now')
        .mockResolvedValue(row.expiresAt);
    try {
      expect((await readQuote(r.entityId, f.buyer)).assessment).toBe('Expired');
      expect((await quote(f, key).expect(200)).body).toEqual(r);
    } finally {
      clock.mockRestore();
    }
    await db.authSession.update({
      where: { id: f.buyer.sessionId },
      data: { revokedAt: new Date() },
    });
    await quote(f, key).expect(401);
    expect(await db.saleQuote.count({ where: { buyerId: f.buyer.id } })).toBe(
      1,
    );
  });
  it('expiry boundaries use server time and reads never renew stored estimates', async () => {
    const f = await setup(),
      r = (await quote(f).expect(200)).body,
      row = await db.saleQuote.findUniqueOrThrow({ where: { id: r.entityId } });
    const clock = vi.spyOn(app.get(QuoteClock), 'now');
    try {
      for (const [offset, status] of [
        [-1, 'Current'],
        [0, 'Expired'],
        [1, 'Expired'],
      ] as const) {
        clock.mockResolvedValue(new Date(row.expiresAt.getTime() + offset));
        const q = await readQuote(row.id, f.buyer);
        expect(q.assessment).toBe(status);
        expect(q.expiresAt).toBe(row.expiresAt.toISOString());
      }
    } finally {
      clock.mockRestore();
    }
    expect(
      await db.saleQuote.findUniqueOrThrow({ where: { id: row.id } }),
    ).toEqual(row);
  });
  it.each(['origin', 'destination'] as const)(
    'marks the quote Changed after %s update/deletion and keeps old amounts',
    async (side) => {
      const f = await setup(),
        r = (await quote(f).expect(200)).body;
      const owner = side === 'origin' ? f.seller : f.buyer,
        address = side === 'origin' ? f.origin : f.destination;
      await mutateAddress(owner, address.id);
      expect((await readQuote(r.entityId, f.buyer)).assessment).toBe('Changed');
      await quote(f).expect(409);
      await mutateAddress(owner, address.id, true);
      const q = await readQuote(r.entityId, f.buyer);
      expect(q.assessment).toBe('Changed');
      expect(q.amounts.buyerTotal).toBe(230000);
    },
  );
  it('new policy invalidates existing quotes without repricing them; policy rows remain immutable', async () => {
    const f = await setup(),
      r = (await quote(f).expect(200)).body;
    await db.saleQuotePolicy.create({
      data: {
        code: 'QA-POLICY',
        shippingFee: 40000,
        commissionBps: 600,
        ttlSeconds: 120,
      },
    });
    await db.saleQuotePolicySelection.update({
      where: { scope: 'DirectSale' },
      data: { policyCode: 'QA-POLICY' },
    });
    try {
      const q = await readQuote(r.entityId, f.buyer);
      expect(q.assessment).toBe('Changed');
      expect(q.amounts.shippingFee).toBe(30000);
      const fresh = await readQuote(
        (await quote(f).expect(200)).body.entityId,
        f.buyer,
      );
      expect(fresh.amounts.shippingFee).toBe(40000);
      expect(fresh.amounts.commission).toBe(12000);
      await expect(
        pool.query(
          "UPDATE sale_quote_policies SET shipping_fee=0 WHERE code='QA-POLICY'",
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.saleQuotePolicySelection.update({
        where: { scope: 'DirectSale' },
        data: { policyCode: 'HCM-DIRECT-v1' },
      });
    }
  });
  it('hide/reopen changes listing version, and seller restriction invalidates current quotes', async () => {
    const f = await setup(),
      r = (await quote(f).expect(200)).body;
    const hidden = await request(app.getHttpServer())
      .put(`/api/v1/listings/${f.l.entityId}/visibility`)
      .set('Authorization', `Bearer ${f.seller.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: f.l.version, visibility: 'Hidden' })
      .expect(200);
    expect((await readQuote(r.entityId, f.buyer)).assessment).toBe(
      'Unavailable',
    );
    const shown = await request(app.getHttpServer())
      .put(`/api/v1/listings/${f.l.entityId}/visibility`)
      .set('Authorization', `Bearer ${f.seller.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: hidden.body.version, visibility: 'Visible' })
      .expect(200);
    expect((await readQuote(r.entityId, f.buyer)).assessment).toBe('Changed');
    const current = (
      await quote(f, randomUUID(), {
        ...f.body,
        expectedListingVersion: shown.body.version,
      }).expect(200)
    ).body;
    await db.user.update({
      where: { id: f.seller.id },
      data: { status: 'RESTRICTED' },
    });
    expect((await readQuote(current.entityId, f.buyer)).assessment).toBe(
      'Unavailable',
    );
    await quote(f, randomUUID(), {
      ...f.body,
      expectedListingVersion: shown.body.version,
    }).expect(409);
  });
  it('supports Both, rejects Exchange and unconfigured legacy origins', async () => {
    const seller = await reader(),
      buyer = await reader(),
      dest = await address(buyer);
    const legacy = await pending(seller);
    const approved = (await decide(legacy).expect(200)).body;
    const body = {
      expectedListingVersion: approved.version,
      expectedListingRevisionId: approved.revisionId,
      destinationAddressId: dest.id,
      expectedDestinationAddressVersion: 1,
      method: 'DirectDelivery',
    };
    await post(`/listings/${approved.entityId}/quotes`, body, buyer).expect(
      422,
    );
    for (const mode of ['Both', 'Exchange']) {
      const f = await setup(),
        c = {
          ...f.l.content,
          mode,
          exchangeValue: 200000,
          salePrice: mode === 'Both' ? 200000 : null,
          fulfillment: {
            originAddressId: f.origin.id,
            originAddressVersion: 1,
            method: 'DirectDelivery',
          },
        };
      const revised = (
        await post(
          `/listings/${f.l.entityId}/revision`,
          { expectedVersion: f.l.version, ownershipDeclared: true, content: c },
          f.seller,
        ).expect(200)
      ).body;
      const a = (await decide(revised).expect(200)).body;
      await quote(f, randomUUID(), {
        ...f.body,
        expectedListingVersion: a.version,
        expectedListingRevisionId: a.revisionId,
      }).expect(mode === 'Both' ? 200 : 409);
    }
  });
  it('same-key race commits one quote/receipt/audit under an actual buyer-lock barrier', async () => {
    const f = await setup(),
      key = randomUUID(),
      b = await blockUser(f.buyer.id);
    const responses = [
      quote(f, key).then((r) => r),
      quote(f, key).then((r) => r),
    ];
    try {
      await blockedBy(b.pid, 2);
      await b.connection.query('COMMIT');
      const [a, c] = await Promise.all(responses);
      expect(a.status).toBe(200);
      expect(c.body).toEqual(a.body);
      expect(await db.saleQuote.count({ where: { buyerId: f.buyer.id } })).toBe(
        1,
      );
      expect(
        await db.auditEvent.count({ where: { quoteId: a.body.entityId } }),
      ).toBe(1);
    } finally {
      await b.connection.query('ROLLBACK');
      b.connection.release();
      await Promise.all(responses);
    }
  });
  it('quota races allow only the twentieth unexpired quote; expiry releases quota without deleting history', async () => {
    const f = await setup();
    for (let i = 0; i < 19; i++) await quote(f).expect(200);
    const b = await blockUser(f.buyer.id),
      responses = [quote(f).then((r) => r), quote(f).then((r) => r)];
    try {
      await blockedBy(b.pid, 2);
      await b.connection.query('COMMIT');
      expect(
        (await Promise.all(responses)).map((r) => r.status).sort(),
      ).toEqual([200, 429]);
    } finally {
      await b.connection.query('ROLLBACK');
      b.connection.release();
      await Promise.all(responses);
    }
    const latest = await db.saleQuote.findFirstOrThrow({
        where: { buyerId: f.buyer.id },
        orderBy: { expiresAt: 'desc' },
      }),
      clock = vi
        .spyOn(app.get(QuoteClock), 'now')
        .mockResolvedValue(new Date(latest.expiresAt.getTime() + 1));
    try {
      await quote(f).expect(200);
      expect(await db.saleQuote.count({ where: { buyerId: f.buyer.id } })).toBe(
        21,
      );
    } finally {
      clock.mockRestore();
    }
  });
  it.each(['address', 'role', 'hidden'] as const)(
    'rechecks %s changes that win the lock before quote creation',
    async (kind) => {
      const f = await setup(),
        b = await blockUser(f.seller.id),
        response = quote(f).then((r) => r);
      try {
        await blockedBy(b.pid);
        if (kind === 'address')
          await b.connection.query(
            'UPDATE member_addresses SET detail=$1 WHERE id=$2',
            ['Gate address change', f.origin.id],
          );
        else if (kind === 'role')
          await b.connection.query('DELETE FROM user_roles WHERE user_id=$1', [
            f.seller.id,
          ]);
        else
          await b.connection.query(
            "UPDATE listings SET visibility='Hidden',version=version+1 WHERE id=$1",
            [f.l.entityId],
          );
        await b.connection.query('COMMIT');
        expect((await response).status).toBe(409);
        expect(
          await db.saleQuote.count({ where: { listingId: f.l.entityId } }),
        ).toBe(0);
      } finally {
        await b.connection.query('ROLLBACK');
        b.connection.release();
        await response;
      }
    },
  );
  it('quote winning first does not block a subsequent address update; subsequent assessment is Changed', async () => {
    const f = await setup(),
      b = await blockUser(f.seller.id),
      response = quote(f).then((r) => r);
    let mutation: Promise<any> | undefined;
    try {
      await blockedBy(b.pid);
      const version = (
        await db.addressBook.findUniqueOrThrow({
          where: { ownerId: f.seller.id },
        })
      ).version;
      mutation = request(app.getHttpServer())
        .put(`/api/v1/me/addresses/${f.origin.id}`)
        .set('Authorization', `Bearer ${f.seller.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedBookVersion: version,
          address: { ...addressInput, detail: 'Updated after quote' },
          makeDefault: false,
        })
        .then((r) => r);
      await blockedBy(b.pid, 2);
      await b.connection.query('COMMIT');
      const q = await response;
      expect(q.status).toBe(200);
      expect((await mutation).status).toBe(200);
      expect((await readQuote(q.body.entityId, f.buyer)).assessment).toBe(
        'Changed',
      );
    } finally {
      await b.connection.query('ROLLBACK');
      b.connection.release();
      await response;
      await mutation;
    }
  });
  it('takes decision time after resource contention and rejects a session expiring while waiting', async () => {
    const f = await setup(),
      b = await pool.connect();
    await b.query('BEGIN');
    await b.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE', [
      f.l.entityId,
    ]);
    const pid = (await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const expiresAt = new Date(Date.now() + 60000);
    await db.authSession.update({
      where: { id: f.buyer.sessionId },
      data: { expiresAt },
    });
    const clock = vi
        .spyOn(app.get(QuoteClock), 'now')
        .mockResolvedValue(expiresAt),
      response = quote(f).then((r) => r);
    try {
      await blockedBy(pid);
      expect(clock).not.toHaveBeenCalled();
      await b.query('COMMIT');
      expect((await response).status).toBe(401);
      expect(await db.saleQuote.count({ where: { buyerId: f.buyer.id } })).toBe(
        0,
      );
    } finally {
      await b.query('ROLLBACK');
      b.release();
      await response;
      clock.mockRestore();
    }
  });
  it('immutable SQL snapshot and balanced amounts reject forgery; audit failure rolls back quote and permits retry', async () => {
    const f = await setup(),
      key = randomUUID();
    await pool.query(
      `CREATE FUNCTION fail_quote_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='createSaleQuote' THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_quote_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_quote_audit()`,
    );
    try {
      await quote(f, key).expect(500);
      expect(await db.saleQuote.count({ where: { buyerId: f.buyer.id } })).toBe(
        0,
      );
    } finally {
      await pool.query(
        'DROP TRIGGER fail_quote_audit ON audit_events; DROP FUNCTION fail_quote_audit()',
      );
    }
    const r = (await quote(f, key).expect(200)).body,
      q = await db.saleQuote.findUniqueOrThrow({ where: { id: r.entityId } });
    await expect(
      pool.query(
        "UPDATE sale_quotes SET expires_at=expires_at+interval '1 minute' WHERE id=$1",
        [q.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM sale_quotes WHERE id=$1', [q.id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.saleQuote.create({ data: { ...q, id: randomUUID(), buyerTotal: 1 } }),
    ).rejects.toBeDefined();
    await expect(
      db.saleQuote.create({
        data: { ...q, id: randomUUID(), buyerId: f.seller.id },
      }),
    ).rejects.toBeDefined();
    await expect(
      db.saleQuote.create({
        data: {
          ...q,
          id: randomUUID(),
          commission: 0,
          sellerProceeds: q.buyerTotal,
        },
      }),
    ).rejects.toBeDefined();
    expect((await quote(f, key).expect(200)).body).toEqual(r);
  });
});
