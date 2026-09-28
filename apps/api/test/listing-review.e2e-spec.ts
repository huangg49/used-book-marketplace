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
import { PageService } from '../src/modules/commands/page.service.js';

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

describe('listing submission and moderation through HTTP with PostgreSQL', () => {
  const schema = `review_http_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, db: PrismaClient, adapter: Adapter, pool: Pool;
  let m1: Reader,
    m2: Reader,
    a1: Reader,
    a2: Reader,
    staff: Reader,
    tester: Reader,
    restricted: Reader;
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
    tester = await reader(['TEST_OPERATOR']);
    restricted = await reader(['MEMBER'], 'RESTRICTED');
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool && /^review_http_test_[a-f0-9]{32}$/.test(schema))
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
  async function effectCounts(id: string) {
    return {
      decisions: await db.listingDecision.count({
        where: { revision: { listingId: id } },
      }),
      receipts: await db.mutationReceipt.count({
        where: { listingId: id, operation: 'decideListing' },
      }),
      audits: await db.auditEvent.count({
        where: { listingId: id, action: 'decideListing' },
      }),
      events: await db.outboxEvent.count({
        where: { audit: { listingId: id, action: 'decideListing' } },
      }),
    };
  }
  it('freezes saved content, exposes the submitted queue, approves once with audit/outbox and replay', async () => {
    const l = await complete();
    await get(`/operations/listings/${l.entityId}`, staff).expect(404);
    const key = randomUUID();
    const sent = await submit(l, m1, key).expect(200);
    validates('MutationReceipt', sent.body);
    expect(sent.body.state.moderation).toBe('PendingReview');
    const replay = await submit(l, m1, key).expect(200);
    expect(replay.body).toEqual(sent.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    const detail = await get(
      `/operations/listings/${l.entityId}`,
      staff,
    ).expect(200);
    validates('PrivateListing', detail.body);
    expect(detail.body.currentRevision.content).toEqual(l.content);
    expect(detail.body.currentRevision.submittedAt).toBeTruthy();
    expect(detail.headers['cache-control']).toBe('no-store');
    await put(
      l.entityId,
      { expectedVersion: sent.body.version, content: l.content },
      m1,
    ).expect(409);
    const decisionKey = randomUUID();
    const approved = await decide(
      sent.body,
      'Approve',
      staff,
      decisionKey,
    ).expect(200);
    validates('MutationReceipt', approved.body);
    expect(approved.body.state.moderation).toBe('Approved');
    expect(
      (await decide(sent.body, 'Approve', staff, decisionKey).expect(200)).body,
    ).toEqual(approved.body);
    expect(await effectCounts(l.entityId)).toEqual({
      decisions: 1,
      receipts: 1,
      audits: 1,
      events: 1,
    });
    const listing = await db.listing.findUniqueOrThrow({
      where: { id: l.entityId },
    });
    expect(listing.publishedAt).not.toBeNull();
    expect(
      (
        await db.outboxEvent.findMany({
          where: { audit: { listingId: l.entityId } },
        })
      )
        .map((e) => e.type)
        .sort(),
    ).toEqual(['ListingApproved', 'ListingSubmitted']);
  });
  it('rejects incomplete saved content and unfinished images without freezing or emitting effects', async () => {
    const empty = await createDraft();
    const invalid = await submit(empty).expect(422);
    validates('ListingApiError', invalid.body);
    expect(
      invalid.body.fieldErrors.some((e: { path: string }) =>
        e.path.startsWith('/content/'),
      ),
    ).toBe(true);
    const l = await complete(m1, true, 'Pending');
    expect((await submit(l).expect(422)).body.code).toBe('MediaNotReady');
    const r = await db.listingRevision.findUniqueOrThrow({
      where: { id: l.revisionId },
    });
    expect(r.submittedAt).toBeNull();
    expect(
      await db.auditEvent.count({
        where: { listingId: l.entityId, action: 'submitListing' },
      }),
    ).toBe(0);
    await post(
      `/listings/${l.entityId}/submit`,
      { expectedVersion: l.version, ownershipDeclared: false },
      m1,
    ).expect(422);
  });
  it('permits submission with own pending catalog, blocks approval, permits rejection and freezes a new resubmitted revision', async () => {
    const l = await pending(m1, false);
    expect((await decide(l).expect(409)).body.code).toBe('CatalogNotConfirmed');
    const rejected = await decide(l, 'Reject').expect(200);
    const second = await submit(rejected.body).expect(200);
    expect(second.body.revisionId).not.toBe(l.revisionId);
    const history = await get(
      `/operations/listings/${l.entityId}/revisions`,
      staff,
    ).expect(200);
    validates('ListingRevisionPage', history.body);
    expect(history.body.items.map((r: { number: number }) => r.number)).toEqual(
      [2, 1],
    );
    expect(history.body.items[1].decision.reason).toBe(
      'Ảnh chưa mô tả rõ tình trạng sách.',
    );
    expect(history.body.items[1].content).toEqual(
      history.body.items[0].content,
    );
    await confirm(l.book).expect(200);
    await decide(second.body, 'Approve', a2).expect(200);
  });
  it('keeps working drafts private after rejection and never lets operations read unattached images', async () => {
    const l = await pending();
    const rejected = await decide(l, 'Reject').expect(200);
    const spare = await asset(l.entityId);
    const saved = await put(
      l.entityId,
      {
        expectedVersion: rejected.body.version,
        content: {
          ...l.content,
          description:
            'Nội dung đang sửa riêng tư, chưa gửi lại cho người kiểm duyệt.',
          mediaIds: [spare.id],
        },
      },
      m1,
    ).expect(200);
    await get(`/operations/listings/${l.entityId}`, staff).expect(404);
    const history = await get(
      `/operations/listings/${l.entityId}/revisions`,
      staff,
    ).expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0].id).toBe(l.revisionId);
    await get(
      `/operations/listings/${l.entityId}/media/${spare.id}/read`,
      staff,
    ).expect(404);
    const read = await get(
      `/operations/listings/${l.entityId}/media/${l.image.id}/read`,
      staff,
    ).expect(200);
    validates('MediaRead', read.body);
    expect(
      await db.auditEvent.count({
        where: {
          mediaId: l.image.id,
          actorId: staff.id,
          action: 'getReviewMediaRead',
        },
      }),
    ).toBe(1);
    await submit(saved.body).expect(200);
  });
  it('enforces ownership, roles, active status and independent review even for an admin owner', async () => {
    const l = await complete();
    await submit(l, m2).expect(404);
    await submit(l, restricted).expect(404);
    await get('/operations/listings').expect(401);
    for (const actor of [m1, tester, restricted])
      await get('/operations/listings', actor).expect(403);
    const restrictedOwner = await complete(await reader());
    const ownerId = (
      await db.listing.findUniqueOrThrow({
        where: { id: restrictedOwner.entityId },
      })
    ).ownerId;
    const owner = await db.user.findUniqueOrThrow({
      where: { id: ownerId },
      include: { sessions: true },
    });
    await db.user.update({
      where: { id: ownerId },
      data: { status: 'RESTRICTED' },
    });
    const ownerToken = await app
      .get(JwtService)
      .signAsync({ sub: owner.id, sid: owner.sessions[0].id });
    await submit(restrictedOwner, {
      id: owner.id,
      token: ownerToken,
      sessionId: owner.sessions[0].id,
      email: owner.emailNormalized,
    }).expect(403);
    const self = await pending(a1);
    expect((await decide(self, 'Approve', a1).expect(403)).body.code).toBe(
      'SelfReviewForbidden',
    );
    await decide(self, 'Reject', a1).expect(403);
    await decide(self, 'Reject', a2).expect(200);
  });
  it('requires every checklist field, meaningful rejection reasons and the exact version/revision', async () => {
    const l = await pending();
    for (const key of Object.keys(checklist))
      await post(
        `/operations/listings/${l.entityId}/decision`,
        {
          expectedVersion: l.version,
          revisionId: l.revisionId,
          decision: 'Approve',
          checklist: { ...checklist, [key]: false },
        },
        staff,
      ).expect(422);
    await post(
      `/operations/listings/${l.entityId}/decision`,
      {
        expectedVersion: l.version,
        revisionId: l.revisionId,
        decision: 'Reject',
        reason: '   sai   ',
      },
      staff,
    ).expect(422);
    await decide({ ...l, revisionId: randomUUID() }).expect(409);
    await decide({ ...l, version: l.version - 1 }).expect(409);
    expect(await effectCounts(l.entityId)).toEqual({
      decisions: 0,
      receipts: 0,
      audits: 0,
      events: 0,
    });
  });
  it('paginates submitted queue with stable cursor scope, validates filters and hides drafts', async () => {
    await pending();
    await pending();
    const first = await get('/operations/listings?limit=1', staff).expect(200);
    validates('PrivateListingPage', first.body);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0].state.moderation).toBe('PendingReview');
    const cursor = encodeURIComponent(first.body.nextCursor);
    const next = await get(
      `/operations/listings?limit=1&cursor=${cursor}`,
      staff,
    ).expect(200);
    expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
    await get(`/operations/listings?cursor=${cursor}`, a1).expect(400);
    await get(
      `/operations/listings?moderation=Approved&cursor=${cursor}`,
      staff,
    ).expect(400);
    await get('/operations/listings?moderation=Draft', staff).expect(400);
  });
  it('rechecks reviewer role after remote signing and records access without exposing a new URL', async () => {
    const actor = await reader(['STAFF']);
    const l = await pending();
    storage.beforeSign = async () => {
      await db.userRole.deleteMany({ where: { userId: actor.id } });
    };
    try {
      const result = await get(
        `/operations/listings/${l.entityId}/media/${l.image.id}/read`,
        actor,
      ).expect(403);
      expect(result.body.url).toBeUndefined();
    } finally {
      storage.beforeSign = undefined;
    }
  });
  it('serializes two reviewers at a real lock barrier and commits exactly one decision', async () => {
    const l = await pending();
    const { connection, pid } = await blockUser(m1.id);
    const first = decide(l, 'Approve', staff).then((r) => r);
    const second = decide(l, 'Reject', a2).then((r) => r);
    try {
      await blockedBy(pid, 2);
      await connection.query('COMMIT');
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
    const results = await Promise.all([first, second]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await effectCounts(l.entityId)).toEqual({
      decisions: 1,
      receipts: 1,
      audits: 1,
      events: 1,
    });
  });
  it.each(['restrict', 'role', 'verified'] as const)(
    'blocks approval when owner eligibility changes while waiting: %s',
    async (change) => {
      const owner = await reader();
      const l = await pending(owner);
      const { connection, pid } = await blockUser(owner.id);
      const response = decide(l).then((r) => r);
      try {
        await blockedBy(pid);
        if (change === 'restrict')
          await connection.query(
            "UPDATE users SET status='RESTRICTED' WHERE id=$1",
            [owner.id],
          );
        if (change === 'role')
          await connection.query(
            "DELETE FROM user_roles WHERE user_id=$1 AND role='MEMBER'",
            [owner.id],
          );
        if (change === 'verified')
          await connection.query(
            'UPDATE users SET email_verified_at=NULL WHERE id=$1',
            [owner.id],
          );
        await connection.query('COMMIT');
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }
      expect((await response).status).toBe(403);
      expect(await effectCounts(l.entityId)).toEqual({
        decisions: 0,
        receipts: 0,
        audits: 0,
        events: 0,
      });
      await decide(l, 'Reject').expect(200);
    },
  );
  it('rechecks member eligibility after lock wait at submission', async () => {
    const owner = await reader();
    const l = await complete(owner);
    const { connection, pid } = await blockUser(owner.id);
    const response = submit(l, owner).then((r) => r);
    try {
      await blockedBy(pid);
      await connection.query(
        "UPDATE users SET status='RESTRICTED' WHERE id=$1",
        [owner.id],
      );
      await connection.query('COMMIT');
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
    expect((await response).status).toBe(403);
    expect(
      (
        await db.listingRevision.findUniqueOrThrow({
          where: { id: l.revisionId },
        })
      ).submittedAt,
    ).toBeNull();
  });
  it('deduplicates simultaneous same-key submission and rejects altered replay or a revoked session', async () => {
    const owner = await reader();
    const l = await complete(owner);
    const key = randomUUID();
    const { connection, pid } = await blockUser(owner.id);
    const first = submit(l, owner, key).then((r) => r);
    const second = submit(l, owner, key).then((r) => r);
    try {
      await blockedBy(pid, 2);
      await connection.query('COMMIT');
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
    const results = await Promise.all([first, second]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    expect(
      await db.outboxEvent.count({
        where: { audit: { listingId: l.entityId, action: 'submitListing' } },
      }),
    ).toBe(1);
    await submit({ ...l, version: l.version + 1 }, owner, key).expect(409);
    await db.authSession.update({
      where: { id: owner.sessionId },
      data: { revokedAt: new Date() },
    });
    await submit(l, owner, key).expect(401);
  });
  it.each(['role', 'session', 'restricted'] as const)(
    'rechecks reviewer authorization after waiting: %s',
    async (change) => {
      const actor = await reader(['STAFF']);
      const l = await pending();
      const { connection, pid } = await blockUser(actor.id);
      const response = decide(l, 'Approve', actor).then((r) => r);
      try {
        await blockedBy(pid);
        if (change === 'role')
          await connection.query('DELETE FROM user_roles WHERE user_id=$1', [
            actor.id,
          ]);
        if (change === 'session')
          await connection.query(
            'UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',
            [actor.sessionId],
          );
        if (change === 'restricted')
          await connection.query(
            "UPDATE users SET status='RESTRICTED' WHERE id=$1",
            [actor.id],
          );
        await connection.query('COMMIT');
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }
      expect((await response).status).toBe(change === 'session' ? 401 : 403);
      expect(await effectCounts(l.entityId)).toEqual({
        decisions: 0,
        receipts: 0,
        audits: 0,
        events: 0,
      });
    },
  );
  it('holds owner eligibility until approval commits when approval wins the lock order', async () => {
    const owner = await reader();
    const l = await pending(owner);
    const gate = await pool.connect();
    await gate.query('BEGIN');
    await gate.query('SELECT pg_advisory_xact_lock(912773)');
    const pid = (await gate.query('SELECT pg_backend_pid() pid')).rows[0]
      .pid as number;
    await pool.query(
      "CREATE FUNCTION pause_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='ListingApproved' THEN PERFORM pg_advisory_xact_lock(912773); END IF; RETURN NEW; END $$; CREATE TRIGGER pause_approval BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION pause_approval()",
    );
    const approval = decide(l).then((r) => r);
    let restriction: Promise<unknown> | undefined;
    try {
      await blockedBy(pid);
      restriction = pool.query(
        "UPDATE users SET status='RESTRICTED' WHERE id=$1",
        [owner.id],
      );
      await blockedBy(pid, 2);
      await gate.query('COMMIT');
      expect((await approval).status).toBe(200);
      await restriction;
      expect(await effectCounts(l.entityId)).toEqual({
        decisions: 1,
        receipts: 1,
        audits: 1,
        events: 1,
      });
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).status,
      ).toBe('RESTRICTED');
    } finally {
      await gate.query('ROLLBACK');
      gate.release();
      await Promise.allSettled([approval, restriction]);
      await pool.query(
        'DROP TRIGGER pause_approval ON outbox_events; DROP FUNCTION pause_approval()',
      );
    }
  });
  it('blocks removed/deleted/unavailable listings and rejects replay after reviewer role loss', async () => {
    for (const data of [
      {
        visibility: 'Removed' as const,
        removalReason: 'Nội dung cần gỡ khỏi hệ thống.',
      },
      { deletedAt: new Date() },
      { trade: 'Sold' as const },
    ]) {
      const l = await pending();
      const changed = await db.listing.update({
        where: { id: l.entityId },
        data: { ...data, version: { increment: 1 } },
      });
      await decide({ ...l, version: changed.version }).expect(
        'deletedAt' in data ? 404 : 409,
      );
      expect(await effectCounts(l.entityId)).toEqual({
        decisions: 0,
        receipts: 0,
        audits: 0,
        events: 0,
      });
      if ('deletedAt' in data)
        await get(
          `/operations/listings/${l.entityId}/media/${l.image.id}/read`,
          staff,
        ).expect(404);
      if ('visibility' in data)
        await get(`/operations/listings/${l.entityId}`, staff).expect(200);
    }
    const l = await pending();
    const actor = await reader(['STAFF']);
    const key = randomUUID();
    await decide(l, 'Approve', actor, key).expect(200);
    await decide(l, 'Reject', actor, key).expect(409);
    await db.userRole.deleteMany({ where: { userId: actor.id } });
    await decide(l, 'Approve', actor, key).expect(403);
  });
  it('rolls back revision freeze, decision, receipt and audit when durable event insertion fails', async () => {
    // Isolated schema, test-only failpoint. No runtime failpoint or HTTP endpoint.
    await pool.query(
      "CREATE FUNCTION reject_review_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type IN ('ListingSubmitted','ListingApproved') THEN RAISE EXCEPTION 'Injected outbox fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_review_event BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION reject_review_event()",
    );
    const l = await complete();
    const key = randomUUID();
    try {
      await submit(l, m1, key).expect(500);
      expect(
        (
          await db.listingRevision.findUniqueOrThrow({
            where: { id: l.revisionId },
          })
        ).submittedAt,
      ).toBeNull();
      expect(
        await db.mutationReceipt.count({
          where: { listingId: l.entityId, operation: 'submitListing' },
        }),
      ).toBe(0);
      expect(
        await db.auditEvent.count({
          where: { listingId: l.entityId, action: 'submitListing' },
        }),
      ).toBe(0);
    } finally {
      await pool.query('DROP TRIGGER reject_review_event ON outbox_events');
    }
    const submitted = await submit(l, m1, key).expect(200);
    await pool.query(
      'CREATE TRIGGER reject_review_event BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION reject_review_event()',
    );
    try {
      await decide(submitted.body).expect(500);
      expect(await effectCounts(l.entityId)).toEqual({
        decisions: 0,
        receipts: 0,
        audits: 0,
        events: 0,
      });
      expect(
        (await db.listing.findUniqueOrThrow({ where: { id: l.entityId } }))
          .moderation,
      ).toBe('PendingReview');
    } finally {
      await pool.query(
        'DROP TRIGGER reject_review_event ON outbox_events; DROP FUNCTION reject_review_event()',
      );
    }
    await decide(submitted.body).expect(200);
  });
  describe('listing lifecycle commands', () => {
    it.each([
      ['archiveListing', 'decideListing'],
      ['decideListing', 'archiveListing'],
      ['removeListing', 'decideListing'],
      ['decideListing', 'removeListing'],
      ['reviseApprovedListing', 'removeListing'],
      ['removeListing', 'reviseApprovedListing'],
      ['saveListingDraft', 'saveListingDraft'],
    ])(
      'holds %s before commit while %s waits, then preserves exactly one effect',
      async (winner, loser) => {
        const l =
          winner === 'saveListingDraft'
            ? await complete()
            : [winner, loser].includes('reviseApprovedListing')
              ? await approved()
              : await pending();
        const actions = [...new Set([winner, loser])];
        const before = {
          audits: await db.auditEvent.count({
            where: { listingId: l.entityId },
          }),
          receipts: await db.mutationReceipt.count({
            where: { listingId: l.entityId },
          }),
          revisions: await db.listingRevision.count({
            where: { listingId: l.entityId },
          }),
          decisions: await db.listingDecision.count({
            where: { revision: { listingId: l.entityId } },
          }),
        };
        const gate = await pool.connect();
        await gate.query('BEGIN');
        await gate.query('SELECT pg_advisory_xact_lock(941207)');
        const pid = (await gate.query('SELECT pg_backend_pid() pid')).rows[0]
          .pid as number;
        await pool.query(
          'CREATE FUNCTION pause_lifecycle_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action=TG_ARGV[0] THEN PERFORM pg_advisory_xact_lock(941207); END IF; RETURN NEW; END $$',
        );
        // Action names above are test literals, never request input; no production failpoint.
        await pool.query(
          `CREATE TRIGGER pause_lifecycle_commit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION pause_lifecycle_commit('${winner}')`,
        );
        const command = (action: string, marker: string) =>
          action === 'archiveListing'
            ? archive(l)
            : action === 'decideListing'
              ? decide(l)
              : action === 'removeListing'
                ? remove(l)
                : action === 'saveListingDraft'
                  ? put(
                      l.entityId,
                      {
                        expectedVersion: l.version,
                        content: { ...l.content, notes: marker },
                      },
                      m1,
                    )
                  : revise(l);
        const first = command(winner, 'Winning edit').then((r) => r);
        let second: Promise<request.Response> | undefined;
        try {
          await blockedBy(pid);
          second = command(loser, 'Losing edit').then((r) => r);
          await blockedBy(pid, 2);
          await gate.query('COMMIT');
          expect((await first).status).toBe(200);
          expect([404, 409]).toContain((await second).status);
          const final = await db.listing.findUniqueOrThrow({
            where: { id: l.entityId },
            include: { currentRevision: true },
          });
          expect(final.version).toBe(l.version + 1);
          expect(
            await db.auditEvent.count({ where: { listingId: l.entityId } }),
          ).toBe(before.audits + 1);
          expect(
            await db.mutationReceipt.count({
              where: { listingId: l.entityId },
            }),
          ).toBe(before.receipts + 1);
          expect(
            await db.listingRevision.count({
              where: { listingId: l.entityId },
            }),
          ).toBe(
            before.revisions + (winner === 'reviseApprovedListing' ? 1 : 0),
          );
          expect(
            await db.listingDecision.count({
              where: { revision: { listingId: l.entityId } },
            }),
          ).toBe(before.decisions + (winner === 'decideListing' ? 1 : 0));
          expect(
            await db.outboxEvent.count({
              where: {
                audit: { listingId: l.entityId, action: { in: actions } },
              },
            }),
          ).toBe(
            [
              'decideListing',
              'removeListing',
              'reviseApprovedListing',
            ].includes(winner)
              ? 1
              : 0,
          );
          if (winner === 'saveListingDraft')
            expect(final.currentRevision!.notes).toBe('Winning edit');
          if (winner === 'archiveListing')
            expect(final.deletedAt).not.toBeNull();
          if (winner === 'removeListing')
            expect(final.visibility).toBe('Removed');
          if (winner === 'decideListing')
            expect(final.moderation).toBe('Approved');
          if (winner === 'reviseApprovedListing')
            expect(final.moderation).toBe('PendingReview');
        } finally {
          await gate.query('ROLLBACK');
          gate.release();
          await Promise.allSettled([first, second]);
          await pool.query(
            'DROP TRIGGER pause_lifecycle_commit ON audit_events; DROP FUNCTION pause_lifecycle_commit()',
          );
        }
      },
    );
    it('rolls back revision, archive, visibility and removal when their audit cannot commit', async () => {
      const l = await approved();
      await pool.query(
        "CREATE FUNCTION reject_lifecycle_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('reviseApprovedListing','archiveListing','setListingVisibility','removeListing') THEN RAISE EXCEPTION 'Injected lifecycle audit fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_lifecycle_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_lifecycle_audit()",
      );
      try {
        await revise(l).expect(500);
        await archive(l).expect(500);
        await visibility(l).expect(500);
        await remove(l).expect(500);
        const final = await db.listing.findUniqueOrThrow({
          where: { id: l.entityId },
        });
        expect(final).toMatchObject({
          version: l.version,
          currentRevisionId: l.revisionId,
          visibility: 'Visible',
          moderation: 'Approved',
          deletedAt: null,
          removalReason: null,
        });
        expect(
          await db.listingRevision.count({ where: { listingId: l.entityId } }),
        ).toBe(1);
        expect(
          await db.mutationReceipt.count({
            where: {
              listingId: l.entityId,
              operation: {
                in: [
                  'reviseApprovedListing',
                  'archiveListing',
                  'setListingVisibility',
                  'removeListing',
                ],
              },
            },
          }),
        ).toBe(0);
      } finally {
        await pool.query(
          'DROP TRIGGER reject_lifecycle_audit ON audit_events; DROP FUNCTION reject_lifecycle_audit()',
        );
      }
    });
    async function approved(actor = m1) {
      const l = await pending(actor);
      const r = await decide(l).expect(200);
      return { ...l, ...r.body };
    }
    const visibility = (
      l: Record<string, any>,
      value = 'Hidden',
      actor = m1,
      key = randomUUID(),
    ) =>
      request(app.getHttpServer())
        .put(`/api/v1/listings/${l.entityId}/visibility`)
        .set('Authorization', `Bearer ${actor.token}`)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: l.version, visibility: value });
    const revise = (
      l: Record<string, any>,
      actor = m1,
      key = randomUUID(),
      content = { ...l.content, salePrice: 145000 },
    ) =>
      post(
        `/listings/${l.entityId}/revision`,
        { expectedVersion: l.version, content, ownershipDeclared: true },
        actor,
        key,
      );
    const archive = (l: Record<string, any>, actor = m1, key = randomUUID()) =>
      post(
        `/listings/${l.entityId}/archive`,
        { expectedVersion: l.version },
        actor,
        key,
      );
    const remove = (
      l: Record<string, any>,
      actor = staff,
      key = randomUUID(),
    ) =>
      post(
        `/operations/listings/${l.entityId}/remove`,
        {
          expectedVersion: l.version,
          reason: 'Thông tin trong bài đăng không đúng với sách.',
        },
        actor,
        key,
      );

    it('revises atomically, freezes old revision/photos and declaration, hides public until approved', async () => {
      const l = await approved(),
        old = (await get(`/me/listings/${l.entityId}`, m1)).body
          .currentRevision;
      const replacement = await asset(l.entityId);
      const key = randomUUID(),
        content = {
          ...l.content,
          salePrice: 145000,
          mediaIds: [replacement.id],
        };
      const r = await revise(l, m1, key, content).expect(200);
      validates('MutationReceipt', r.body);
      expect(r.body.state.moderation).toBe('PendingReview');
      expect(r.body.revisionId).not.toBe(l.revisionId);
      await get(`/listings/${l.entityId}`).expect(404);
      expect((await revise(l, m1, key, content).expect(200)).body).toEqual(
        r.body,
      );
      const history = (await get(`/me/listings/${l.entityId}/revisions`, m1))
        .body.items;
      expect(history.find((i: any) => i.id === old.id)).toEqual(old);
      await decide(r.body).expect(200);
      const publicBook = (await get(`/listings/${l.entityId}`).expect(200))
        .body;
      expect(publicBook.salePrice).toBe(145000);
      expect(publicBook.photos.map((i: any) => i.id)).toEqual([replacement.id]);
      await get(`/listings/${l.entityId}/media/${l.image.id}/read`).expect(404);
      expect(
        await db.outboxEvent.count({
          where: {
            type: 'ListingSubmitted',
            payload: { path: ['revisionId'], equals: r.body.revisionId },
          },
        }),
      ).toBe(1);
    });
    it('preserves Hidden during revision and approval, then reopens without changing revision', async () => {
      const l = await approved();
      const h = await visibility(l).expect(200);
      const r = await revise({ ...l, ...h.body }).expect(200);
      const a = await decide(r.body).expect(200);
      expect(a.body.state.visibility).toBe('Hidden');
      await get(`/listings/${l.entityId}`).expect(404);
      const visible = await visibility({ ...l, ...a.body }, 'Visible').expect(
        200,
      );
      expect(visible.body.revisionId).toBe(r.body.revisionId);
      await get(`/listings/${l.entityId}`).expect(200);
      await visibility({ ...l, ...visible.body }, 'Visible').expect(409);
    });
    it('permits restricted owners to hide/archive but rejects edit/reopen and other owners', async () => {
      const owner = await reader(),
        l = await approved(owner);
      await visibility(l, 'Hidden', m2).expect(404);
      await archive(l, m2).expect(404);
      await revise(l, m2).expect(404);
      await db.user.update({
        where: { id: owner.id },
        data: { status: 'RESTRICTED' },
      });
      await revise(l, owner).expect(403);
      const h = await visibility(l, 'Hidden', owner).expect(200);
      await visibility({ ...l, ...h.body }, 'Visible', owner).expect(403);
      await archive({ ...l, ...h.body }, owner).expect(200);
    });
    it('archives pending review, replays a deleted receipt but blocks all private/public reads and decisions', async () => {
      const l = await pending(),
        key = randomUUID();
      const first = await archive(l, m1, key).expect(200);
      expect(first.body.state.deletedAt).toBeTruthy();
      expect((await archive(l, m1, key).expect(200)).body).toEqual(first.body);
      await archive(l).expect(404);
      await decide(l).expect(404);
      for (const path of [
        `/listings/${l.entityId}`,
        `/me/listings/${l.entityId}`,
        `/operations/listings/${l.entityId}`,
        `/me/listings/${l.entityId}/media/${l.image.id}/read`,
      ])
        await get(path, path.startsWith('/operations') ? staff : m1).expect(
          404,
        );
      expect(
        await db.listingRevision.count({ where: { listingId: l.entityId } }),
      ).toBe(1);
      expect(
        await db.mutationReceipt.count({
          where: { listingId: l.entityId, operation: 'archiveListing' },
        }),
      ).toBe(1);
      await post(
        `/listings/${l.entityId}/archive`,
        { expectedVersion: 123 },
        m1,
        key,
      ).expect(409);
    });
    it('removes with a reason, preserves history and trade, blocks restoration and unauthorized/self removal', async () => {
      const owner = await reader(['MEMBER', 'STAFF']),
        l = await approved(owner),
        key = randomUUID();
      await remove(l, owner).expect(403);
      await remove(l, m1).expect(403);
      await remove(l, tester).expect(403);
      await post(
        `/operations/listings/${l.entityId}/remove`,
        { expectedVersion: l.version, reason: 'short' },
        staff,
      ).expect(422);
      const r = await remove(l, staff, key).expect(200);
      expect(r.body.state).toMatchObject({
        visibility: 'Removed',
        moderation: 'Approved',
        trade: 'Available',
      });
      expect((await remove(l, staff, key).expect(200)).body).toEqual(r.body);
      const own = (await get(`/me/listings/${l.entityId}`, owner).expect(200))
        .body;
      expect(own.removalReason).toBe(
        'Thông tin trong bài đăng không đúng với sách.',
      );
      await get(`/operations/listings/${l.entityId}`, staff).expect(200);
      await get(`/listings/${l.entityId}`).expect(404);
      await visibility({ ...l, ...r.body }, 'Visible', owner).expect(409);
      await revise({ ...l, ...r.body }, owner).expect(409);
      await archive({ ...l, ...r.body }, owner).expect(409);
      const draftOnly = await complete();
      await remove(draftOnly).expect(404);
      expect(
        await db.outboxEvent.count({
          where: {
            type: 'ListingRemoved',
            payload: { path: ['entityId'], equals: l.entityId },
          },
        }),
      ).toBe(1);
    });
    it.each(['Sold', 'Exchanged', 'ClosedUnavailable'] as const)(
      'rejects lifecycle mutation for %s without touching trade',
      async (trade) => {
        const l = await approved();
        await db.listing.update({
          where: { id: l.entityId },
          data: { trade, version: { increment: 1 } },
        });
        l.version++;
        await revise(l).expect(409);
        await visibility(l).expect(409);
        await archive(l).expect(409);
        await remove(l).expect(409);
        expect(
          (await db.listing.findUniqueOrThrow({ where: { id: l.entityId } }))
            .trade,
        ).toBe(trade);
      },
    );
    it('validates declaration, complete content, media ownership/readiness and stale version', async () => {
      const l = await approved(),
        other = await complete(m2),
        processing = await asset(l.entityId, 'Pending');
      await post(
        `/listings/${l.entityId}/revision`,
        {
          expectedVersion: l.version,
          content: l.content,
          ownershipDeclared: false,
        },
        m1,
      ).expect(422);
      await revise(l, m1, randomUUID(), {
        ...l.content,
        description: '',
      }).expect(422);
      await revise(l, m1, randomUUID(), {
        ...l.content,
        mediaIds: [other.image.id],
      }).expect(422);
      await revise(l, m1, randomUUID(), {
        ...l.content,
        mediaIds: [processing.id],
      }).expect(422);
      await revise({ ...l, version: l.version - 1 }).expect(409);
      await get(`/listings/${l.entityId}`).expect(200);
    });
    it('serializes archive against approve so exactly one version wins', async () => {
      const l = await pending();
      const responses = await Promise.all([archive(l), decide(l)]);
      expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        responses.filter((r) => [404, 409].includes(r.status)),
      ).toHaveLength(1);
      const final = await db.listing.findUniqueOrThrow({
        where: { id: l.entityId },
      });
      expect(final.version).toBe(l.version + 1);
      expect(
        final.deletedAt
          ? final.moderation === 'PendingReview'
          : final.moderation === 'Approved',
      ).toBe(true);
    });
    it('serializes revise against staff removal and duplicate hide keys', async () => {
      const l = await approved();
      const responses = await Promise.all([revise(l), remove(l)]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const another = await approved(),
        key = randomUUID();
      const duplicate = await Promise.all([
        visibility(another, 'Hidden', m1, key),
        visibility(another, 'Hidden', m1, key),
      ]);
      expect(duplicate.map((r) => r.status)).toEqual([200, 200]);
      expect(duplicate[0].body).toEqual(duplicate[1].body);
      expect(
        await db.auditEvent.count({
          where: {
            listingId: another.entityId,
            action: 'setListingVisibility',
          },
        }),
      ).toBe(1);
    });
    it('rechecks role and active status after lock waits before revising and replaying', async () => {
      const owner = await reader(),
        l = await approved(owner);
      const { connection, pid } = await blockUser(owner.id);
      const response = revise(l, owner).then((r) => r);
      try {
        await blockedBy(pid);
        await connection.query(
          "UPDATE users SET status='RESTRICTED' WHERE id=$1",
          [owner.id],
        );
        await connection.query('COMMIT');
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }
      expect((await response).status).toBe(403);
      const key = randomUUID();
      await archive(l, owner, key).expect(200);
      await db.userRole.deleteMany({
        where: { userId: owner.id, role: 'MEMBER' },
      });
      await archive(l, owner, key).expect(403);
    });
  });
  describe('eligible public shelf/detail/media', () => {
    async function published(
      actor = m1,
      title = 'Đường sách chuyền tay',
      prices?: {
        mode: string;
        salePrice: number | null;
        exchangeValue: number | null;
      },
      isbn: string | null = null,
    ) {
      let l = await complete(actor, true, 'Ready', {
        ...metadata(title),
        isbn,
      });
      if (prices) {
        const saved = await put(
          l.entityId,
          { expectedVersion: l.version, content: { ...l.content, ...prices } },
          actor,
        ).expect(200);
        l = { ...l, ...saved.body };
      }
      const sent = await submit(l, actor).expect(200);
      await decide(sent.body).expect(200);
      return l;
    }
    it('serves a closed anonymous projection, ordered descriptors, no-store and separate signed reads', async () => {
      const l = await published();
      const detail = await get(`/listings/${l.entityId}`).expect(200);
      validates('PublicListing', detail.body);
      expect(detail.headers['cache-control']).toBe('no-store');
      expect(detail.body.seller).toEqual({
        id: m1.id,
        displayName: 'Bạn đọc thử nghiệm',
      });
      expect(detail.body.photos).toEqual([
        { id: l.image.id, width: 20, height: 20 },
      ]);
      for (const forbidden of [
        'emailNormalized',
        'passwordHash',
        'latestDecision',
        'ownershipDeclaredAt',
        'derivativeKey',
        'reason',
        'ownerId',
      ])
        expect(JSON.stringify(detail.body)).not.toContain(forbidden);
      const list = await get(`/listings?bookId=${l.book.entityId}`).expect(200);
      validates('PublicListingPage', list.body);
      expect(list.body.items.map((i: any) => i.id)).toEqual([l.entityId]);
      const photo = await get(
        `/listings/${l.entityId}/media/${l.image.id}/read`,
      ).expect(200);
      validates('MediaRead', photo.body);
      expect(photo.headers['cache-control']).toBe('no-store');
      const unattached = await asset(l.entityId);
      await get(`/listings/${l.entityId}/media/${unattached.id}/read`).expect(
        404,
      );
      await get(`/listings/${randomUUID()}/media/${l.image.id}/read`).expect(
        404,
      );
    });
    it.each([
      { visibility: 'Hidden' },
      { visibility: 'Removed', removalReason: 'Gỡ nội dung kiểm thử khỏi kệ.' },
      { deletedAt: new Date() },
      { trade: 'Sold' },
      { trade: 'Exchanged' },
      { trade: 'ClosedUnavailable' },
    ])(
      'excludes a previously approved listing after state change: %j',
      async (data) => {
        const l = await published();
        await db.listing.update({
          where: { id: l.entityId },
          data: { ...data, version: { increment: 1 } } as any,
        });
        await get(`/listings/${l.entityId}`).expect(404);
        await get(`/listings/${l.entityId}`, m1).expect(404);
        await get(`/listings/${l.entityId}/media/${l.image.id}/read`).expect(
          404,
        );
        expect(
          (await get(`/listings?bookId=${l.book.entityId}`).expect(200)).body
            .items,
        ).toEqual([]);
      },
    );
    it('keeps draft/pending/rejected and working revisions private, including prior submitted photos', async () => {
      const l = await complete();
      await get(`/listings/${l.entityId}`).expect(404);
      const sent = await submit(l).expect(200);
      await get(`/listings/${l.entityId}`).expect(404);
      const rejected = await decide(sent.body, 'Reject').expect(200);
      await get(`/listings/${l.entityId}`).expect(404);
      const saved = await put(
        l.entityId,
        {
          expectedVersion: rejected.body.version,
          content: { ...l.content, mediaIds: [] },
        },
        m1,
      ).expect(200);
      const newImage = await asset(l.entityId);
      const next = await put(
        l.entityId,
        {
          expectedVersion: saved.body.version,
          content: { ...l.content, mediaIds: [newImage.id] },
        },
        m1,
      ).expect(200);
      const resubmitted = await submit(next.body).expect(200);
      await decide(resubmitted.body).expect(200);
      await get(`/listings/${l.entityId}/media/${l.image.id}/read`).expect(404);
      await get(`/listings/${l.entityId}/media/${newImage.id}/read`).expect(
        200,
      );
      expect(
        (await get(`/listings/${l.entityId}`).expect(200)).body.photos[0].id,
      ).toBe(newImage.id);
      const pendingCatalog = await pending(m1, false);
      await get(`/listings/${pendingCatalog.entityId}`).expect(404);
    });
    it.each([
      'RESTRICTED',
      'LOCKED',
      'DISABLED',
      'PENDING_VERIFICATION',
    ] as const)(
      'rechecks current owner status %s on all public routes',
      async (status) => {
        const owner = await reader(),
          l = await published(owner);
        await db.user.update({ where: { id: owner.id }, data: { status } });
        await get(`/listings/${l.entityId}`).expect(404);
        await get(`/listings/${l.entityId}/media/${l.image.id}/read`).expect(
          404,
        );
        expect(
          (await get(`/listings?bookId=${l.book.entityId}`).expect(200)).body
            .items,
        ).toEqual([]);
      },
    );
    it('rechecks owner verification and MEMBER role even though historical approval exists', async () => {
      const owner = await reader(),
        l = await published(owner);
      await db.user.update({
        where: { id: owner.id },
        data: { emailVerifiedAt: null },
      });
      await get(`/listings/${l.entityId}`).expect(404);
      await db.user.update({
        where: { id: owner.id },
        data: { emailVerifiedAt: new Date() },
      });
      await db.userRole.deleteMany({
        where: { userId: owner.id, role: 'MEMBER' },
      });
      await get(`/listings/${l.entityId}/media/${l.image.id}/read`).expect(404);
      expect(
        (await get(`/listings?bookId=${l.book.entityId}`).expect(200)).body
          .items,
      ).toEqual([]);
    });
    it('binds keyset cursors to filters and sorts; handles Vietnamese/literal search and nullable prices', async () => {
      const tag = randomUUID();
      const title = `Đường sách ${tag} 100%_`;
      const a = await published(m1, title, {
        mode: 'Sale',
        salePrice: 120000,
        exchangeValue: null,
      });
      const b = await published(m1, title, {
        mode: 'Both',
        salePrice: 120000,
        exchangeValue: 150000,
      });
      const c = await published(m1, title, {
        mode: 'Exchange',
        salePrice: null,
        exchangeValue: 100000,
      });
      const search = encodeURIComponent(`DUONG SACH ${tag}`);
      const first = await get(
        `/listings?q=${search}&sort=salePriceAsc&limit=1`,
      ).expect(200);
      const second = await get(
        `/listings?q=${search}&sort=salePriceAsc&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      ).expect(200);
      expect([first.body.items[0].id, second.body.items[0].id]).toEqual(
        [a.entityId, b.entityId].sort(),
      );
      expect(second.body.nextCursor).toBeNull();
      await get(
        `/listings?q=${search}&sort=salePriceDesc&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      ).expect(400);
      await get('/listings?cursor=broken').expect(400);
      await get('/listings?limit=51').expect(400);
      await get('/listings?minSalePrice=150000&maxSalePrice=100000').expect(
        422,
      );
      expect(
        (await get(`/listings?q=${search}&mode=Sale`).expect(200)).body.items,
      ).toHaveLength(2);
      expect(
        (
          await get(`/listings?q=${search}&mode=Both`).expect(200)
        ).body.items.map((i: any) => i.id),
      ).toEqual([b.entityId]);
      expect(
        (
          await get(
            `/listings?q=${search}&minSalePrice=120000&maxExchangeValue=150000`,
          ).expect(200)
        ).body.items.map((i: any) => i.id),
      ).toEqual([b.entityId]);
      expect(
        (
          await get(`/listings?q=${search}&sort=exchangeValueAsc`).expect(200)
        ).body.items.map((i: any) => i.id),
      ).toEqual([c.entityId, b.entityId]);
      expect(
        (
          await get(`/listings?q=${encodeURIComponent(tag + ' 100%_')}`).expect(
            200,
          )
        ).body.items,
      ).toHaveLength(3);
      expect(
        (
          await get(`/listings?q=${encodeURIComponent(tag + ' 100__')}`).expect(
            200,
          )
        ).body.items,
      ).toHaveLength(0);
      expect(
        (await get(`/listings?q=${search}&condition=Fair`).expect(200)).body
          .items,
      ).toHaveLength(0);
    });
    it('matches canonical ISBN-10 and normalized author within a book filter', async () => {
      const l = await published(
        m1,
        'ISBN public lookup',
        undefined,
        '9780306406157',
      );
      for (const q of ['0-306-40615-2', 'NGUOI VIET']) {
        const page = await get(
          `/listings?bookId=${l.book.entityId}&q=${encodeURIComponent(q)}`,
        ).expect(200);
        expect(page.body.items.map((item: any) => item.id)).toEqual([
          l.entityId,
        ]);
      }
      expect(
        (
          await get(
            `/listings?bookId=${l.book.entityId}&q=9781861972712`,
          ).expect(200)
        ).body.items,
      ).toEqual([]);
    });
    it('uses one read snapshot when eligibility changes between page selection and projection', async () => {
      const l = await published();
      const service = app.get(PageService),
        original = service.select.bind(service);
      const spy = vi
        .spyOn(service, 'select')
        .mockImplementationOnce(async (tx, options) => {
          const selected = await original(tx, options);
          await db.listing.update({
            where: { id: l.entityId },
            data: { visibility: 'Hidden', version: { increment: 1 } },
          });
          return selected;
        });
      try {
        const page = await get(`/listings?bookId=${l.book.entityId}`).expect(
          200,
        );
        expect(page.body.items).toHaveLength(1);
        validates('PublicListingPage', page.body);
      } finally {
        spy.mockRestore();
      }
      await get(`/listings/${l.entityId}`).expect(404);
    });
    it('does not return a signed URL when owner eligibility is revoked during signing', async () => {
      const owner = await reader(),
        l = await published(owner);
      let entered!: () => void, release!: () => void;
      const signing = new Promise<void>((resolve) => {
          entered = resolve;
        }),
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
      storage.beforeSign = async () => {
        entered();
        await gate;
      };
      const response = get(
        `/listings/${l.entityId}/media/${l.image.id}/read`,
      ).then((r) => r);
      try {
        await signing;
        await db.userRole.deleteMany({
          where: { userId: owner.id, role: 'MEMBER' },
        });
        release();
        expect((await response).status).toBe(404);
      } finally {
        release();
        storage.beforeSign = undefined;
        await response;
      }
    });
  });
  describe('revision-bound delivery origins', () => {
    const contact = {
      recipientName: 'Riêng tư nơi gửi',
      phone: '0912345678',
      serviceAreaCode: 'HCM-DEMO-v1',
      localityCode: 'DEMO-A',
      detail: 'Địa chỉ kiểm thử riêng — không giao thật',
    };
    async function addressBook(owner: Reader) {
      return (await get('/me/addresses', owner).expect(200)).body;
    }
    async function origin(owner: Reader) {
      const b = await addressBook(owner);
      const r = await post(
        '/me/addresses',
        {
          expectedBookVersion: b.version,
          address: contact,
          makeDefault: false,
        },
        owner,
      ).expect(200);
      return {
        originAddressId: r.body.addressId,
        originAddressVersion: 1,
        method: 'DirectDelivery' as const,
      };
    }
    async function changeAddress(
      owner: Reader,
      ref: { originAddressId: string },
      remove = false,
    ) {
      const b = await addressBook(owner);
      if (remove)
        return post(
          `/me/addresses/${ref.originAddressId}/archive`,
          { expectedBookVersion: b.version },
          owner,
        ).expect(200);
      return request(app.getHttpServer())
        .put(`/api/v1/me/addresses/${ref.originAddressId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedBookVersion: b.version,
          address: { ...contact, detail: 'Nơi gửi mới chỉ dành cho kiểm thử' },
          makeDefault: false,
        })
        .expect(200);
    }
    async function configured(owner: Reader) {
      const l = await complete(owner),
        fulfillment = await origin(owner);
      const content = { ...l.content, fulfillment };
      const r = await put(
        l.entityId,
        { expectedVersion: l.version, content },
        owner,
      ).expect(200);
      return { ...l, ...r.body, content, fulfillment };
    }
    it('binds an owned current origin, preserves omission, explicitly clears and rejects unsupported methods/foreign/stale input', async () => {
      const owner = await reader(),
        other = await reader(),
        f = await origin(owner),
        foreign = await origin(other);
      const created = await post(
        '/listings',
        { content: { ...draft(), fulfillment: f } },
        owner,
      ).expect(200);
      const id = created.body.entityId;
      const saved = await put(
        id,
        { expectedVersion: 1, content: draft() },
        owner,
      ).expect(200);
      const own = (await get(`/me/listings/${id}`, owner).expect(200)).body;
      validates('PrivateListing', own);
      expect(own.currentRevision.content.fulfillment).toEqual(f);
      expect(own.currentRevision.fulfillmentStatus).toBe('Current');
      for (const [fulfillment, status] of [
        [foreign, 404],
        [{ ...f, originAddressVersion: 2 }, 409],
        [{ ...f, method: 'ViaPoint' }, 422],
      ] as const)
        await put(
          id,
          {
            expectedVersion: saved.body.version,
            content: { ...draft(), fulfillment },
          },
          owner,
        ).expect(status);
      await put(
        id,
        {
          expectedVersion: saved.body.version,
          content: { ...draft(), fulfillment: null },
        },
        owner,
      ).expect(200);
      expect(
        (await get(`/me/listings/${id}`, owner)).body.currentRevision
          .fulfillmentStatus,
      ).toBe('NotConfigured');
      expect(await db.mutationReceipt.count({ where: { listingId: id } })).toBe(
        3,
      );
    });
    it('publishes only region/method and never contact references; legacy listings remain readable', async () => {
      const owner = await reader(),
        l = await configured(owner);
      const sent = (await submit(l, owner).expect(200)).body;
      await decide(sent).expect(200);
      const pub = (await get(`/listings/${l.entityId}`).expect(200)).body;
      validates('PublicListing', pub);
      expect(pub.fulfillment).toEqual({
        serviceAreaCode: 'HCM-DEMO-v1',
        name: 'TP.HCM',
        demoOnly: true,
        method: 'DirectDelivery',
      });
      const views = [
        pub,
        (await get('/listings')).body,
        (await get(`/operations/listings/${l.entityId}`, staff)).body,
      ];
      for (const view of views)
        for (const secret of [
          contact.recipientName,
          contact.phone,
          contact.detail,
        ])
          expect(JSON.stringify(view)).not.toContain(secret);
      expect(JSON.stringify(pub)).not.toContain(l.fulfillment.originAddressId);
      const receipts = await db.mutationReceipt.findMany({
          where: { listingId: l.entityId },
        }),
        audits = await db.auditEvent.findMany({
          where: { listingId: l.entityId },
        });
      for (const secret of [
        contact.recipientName,
        contact.phone,
        contact.detail,
      ])
        expect(JSON.stringify([receipts, audits])).not.toContain(secret);
      const legacy = await pending(owner);
      await decide(legacy).expect(200);
      expect(
        (await get(`/listings/${legacy.entityId}`).expect(200)).body
          .fulfillment,
      ).toBeNull();
    });
    it('does not invalidate origins for default changes, unrelated addresses or no-op contact saves', async () => {
      const owner = await reader(),
        l = await configured(owner),
        second = await origin(owner);
      const b = await addressBook(owner);
      await post(
        `/me/addresses/${second.originAddressId}/default`,
        { expectedBookVersion: b.version },
        owner,
      ).expect(200);
      await changeAddress(owner, second);
      const latest = await addressBook(owner);
      await request(app.getHttpServer())
        .put(`/api/v1/me/addresses/${l.fulfillment.originAddressId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedBookVersion: latest.version,
          address: contact,
          makeDefault: false,
        })
        .expect(200);
      expect(
        (await addressBook(owner)).items.find(
          (a: any) => a.id === l.fulfillment.originAddressId,
        ).version,
      ).toBe(1);
      expect(
        (await get(`/me/listings/${l.entityId}`, owner)).body.currentRevision
          .fulfillmentStatus,
      ).toBe('Current');
    });
    it.each([false, true])(
      'changed/deleted address invalidates choice without mutating frozen revision (deleted=%s)',
      async (remove) => {
        const owner = await reader(),
          l = await configured(owner),
          sent = (await submit(l, owner).expect(200)).body;
        await decide(sent).expect(200);
        const old = await db.listingRevision.findUniqueOrThrow({
          where: { id: sent.revisionId },
        });
        await changeAddress(owner, l.fulfillment, remove);
        const own = (await get(`/me/listings/${l.entityId}`, owner).expect(200))
          .body;
        expect(own.currentRevision.fulfillmentStatus).toBe('NeedsUpdate');
        expect(own.currentRevision.content.fulfillment).toEqual(l.fulfillment);
        expect(
          await db.listingRevision.findUniqueOrThrow({
            where: { id: sent.revisionId },
          }),
        ).toEqual(old);
        expect(
          (await get(`/listings/${l.entityId}`).expect(200)).body.fulfillment,
        ).toBeNull();
        if (remove) {
          expect(
            await db.memberAddress.findUnique({
              where: { id: l.fulfillment.originAddressId },
            }),
          ).toBeNull();
          expect(
            await db.addressIdentity.findUnique({
              where: { id: l.fulfillment.originAddressId },
            }),
          ).toEqual({ id: l.fulfillment.originAddressId, ownerId: owner.id });
        }
      },
    );
    it('blocks stale submission/approval but lets reviewer reject and owner submit an updated revision', async () => {
      const owner = await reader(),
        l = await configured(owner);
      await changeAddress(owner, l.fulfillment);
      await submit(l, owner).expect(409);
      const content = {
        ...l.content,
        fulfillment: { ...l.fulfillment, originAddressVersion: 2 },
      };
      const saved = (
        await put(
          l.entityId,
          { expectedVersion: l.version, content },
          owner,
        ).expect(200)
      ).body;
      const sent = (await submit(saved, owner).expect(200)).body;
      await changeAddress(owner, l.fulfillment, true);
      await decide(sent).expect(404);
      const rejected = (await decide(sent, 'Reject').expect(200)).body;
      const f = await origin(owner),
        replacement = (
          await put(
            l.entityId,
            {
              expectedVersion: rejected.version,
              content: { ...content, fulfillment: f },
            },
            owner,
          ).expect(200)
        ).body;
      expect(replacement.revisionId).not.toBe(sent.revisionId);
      const resubmitted = (await submit(replacement, owner).expect(200)).body;
      await decide(resubmitted).expect(200);
    });
    it('approved delivery edits freeze a new revision, withdraw public view, and replay after address deletion', async () => {
      const owner = await reader(),
        l = await configured(owner),
        sent = (await submit(l, owner).expect(200)).body;
      const approved = (await decide(sent).expect(200)).body,
        next = await origin(owner),
        key = randomUUID();
      const body = {
        expectedVersion: approved.version,
        ownershipDeclared: true,
        content: { ...l.content, fulfillment: next },
      };
      const replacement = (
        await post(`/listings/${l.entityId}/revision`, body, owner, key).expect(
          200,
        )
      ).body;
      expect(replacement.state.moderation).toBe('PendingReview');
      expect(replacement.revisionId).not.toBe(sent.revisionId);
      await get(`/listings/${l.entityId}`).expect(404);
      await changeAddress(owner, next, true);
      const replay = await post(
        `/listings/${l.entityId}/revision`,
        body,
        owner,
        key,
      ).expect(200);
      expect(replay.body).toEqual(replacement);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(
        await db.listingRevision.count({ where: { listingId: l.entityId } }),
      ).toBe(2);
    });
    it('rechecks a changed origin after a real owner-lock barrier and rolls back the losing save', async () => {
      const owner = await reader(),
        l = await configured(owner),
        b = await blockUser(owner.id);
      const response = put(
        l.entityId,
        { expectedVersion: l.version, content: l.content },
        owner,
      ).then((r) => r);
      try {
        await blockedBy(b.pid);
        await b.connection.query(
          'UPDATE member_addresses SET detail=$1 WHERE id=$2',
          ['Địa chỉ mới tại gate', l.fulfillment.originAddressId],
        );
        await b.connection.query('COMMIT');
        expect((await response).status).toBe(409);
        expect(
          (await db.listing.findUniqueOrThrow({ where: { id: l.entityId } }))
            .version,
        ).toBe(l.version);
      } finally {
        await b.connection.query('ROLLBACK');
        b.connection.release();
        await response;
      }
    });
    it('approval rechecks origin after deletion wins the lock; no decision/audit is created', async () => {
      const owner = await reader(),
        l = await configured(owner),
        sent = (await submit(l, owner).expect(200)).body,
        b = await blockUser(owner.id);
      const response = decide(sent).then((r) => r);
      try {
        await blockedBy(b.pid);
        await b.connection.query('DELETE FROM member_addresses WHERE id=$1', [
          l.fulfillment.originAddressId,
        ]);
        await b.connection.query('COMMIT');
        expect((await response).status).toBe(404);
        expect(await effectCounts(l.entityId)).toEqual({
          decisions: 0,
          receipts: 0,
          audits: 0,
          events: 0,
        });
      } finally {
        await b.connection.query('ROLLBACK');
        b.connection.release();
        await response;
      }
    });
    it('approval winning the real lock precedes deletion; history stays approved and public choice becomes unavailable', async () => {
      const owner = await reader(),
        l = await configured(owner),
        sent = (await submit(l, owner).expect(200)).body,
        b = await blockUser(owner.id);
      const response = decide(sent).then((r) => r);
      let deletion: Promise<any> | undefined;
      try {
        await blockedBy(b.pid);
        const version = (
          await db.addressBook.findUniqueOrThrow({
            where: { ownerId: owner.id },
          })
        ).version;
        deletion = post(
          `/me/addresses/${l.fulfillment.originAddressId}/archive`,
          { expectedBookVersion: version },
          owner,
        ).then((r) => r);
        await blockedBy(b.pid, 2);
        await b.connection.query('COMMIT');
        expect((await response).status).toBe(200);
        expect((await deletion).status).toBe(200);
        expect(
          (await get(`/listings/${l.entityId}`).expect(200)).body.fulfillment,
        ).toBeNull();
      } finally {
        await b.connection.query('ROLLBACK');
        b.connection.release();
        await response;
        await deletion;
      }
    });
    it('SQL backstops forbid cross-owner, partial, forged version, reused identities and frozen origin rewrites', async () => {
      const owner = await reader(),
        other = await reader(),
        l = await configured(owner),
        foreign = await origin(other);
      await expect(
        pool.query(
          'UPDATE listing_revisions SET origin_address_id=$1 WHERE id=$2',
          [foreign.originAddressId, l.revisionId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          'UPDATE listing_revisions SET origin_address_version=NULL WHERE id=$1',
          [l.revisionId],
        ),
      ).rejects.toBeDefined();
      await expect(
        pool.query('UPDATE member_addresses SET version=99 WHERE id=$1', [
          l.fulfillment.originAddressId,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      const sent = (await submit(l, owner).expect(200)).body;
      await expect(
        pool.query(
          'UPDATE listing_revisions SET origin_address_id=NULL, origin_address_version=NULL, origin_service_area_code=NULL WHERE id=$1',
          [sent.revisionId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await changeAddress(other, foreign, true);
      await expect(
        db.memberAddress.create({
          data: {
            id: foreign.originAddressId,
            ownerId: other.id,
            ...contact,
            isDefault: true,
          },
        }),
      ).rejects.toBeDefined();
      await expect(
        pool.query('UPDATE address_identities SET owner_id=$1 WHERE id=$2', [
          owner.id,
          foreign.originAddressId,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
    it('audit failure rolls back a delivery edit and identical retry applies it once', async () => {
      const owner = await reader(),
        l = await configured(owner),
        next = await origin(owner),
        key = randomUUID(),
        body = {
          expectedVersion: l.version,
          content: { ...l.content, fulfillment: next },
        };
      await pool.query(
        `CREATE FUNCTION fail_origin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.listing_id='${l.entityId}'::uuid THEN RAISE EXCEPTION 'test failpoint'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_origin_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_origin_audit()`,
      );
      try {
        await put(l.entityId, body, owner, key).expect(500);
        expect(
          (await get(`/me/listings/${l.entityId}`, owner)).body.currentRevision
            .content.fulfillment,
        ).toEqual(l.fulfillment);
      } finally {
        await pool.query(
          'DROP TRIGGER fail_origin_audit ON audit_events; DROP FUNCTION fail_origin_audit()',
        );
      }
      const saved = await put(l.entityId, body, owner, key).expect(200);
      expect(saved.body.version).toBe(l.version + 1);
      expect(
        (await put(l.entityId, body, owner, key).expect(200)).body,
      ).toEqual(saved.body);
    });
  });
});
