import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hash } from 'argon2';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { onTransactionRetry } from '../src/database/mongo/transaction.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

type Reader = { id: string; token: string; sessionId: string; email: string };
const PASSWORD = 'Only-a-test-password-2026';
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

describe('catalog and listing drafts through HTTP with MongoDB', () => {
  let app: INestApplication, db: MongoFixtures, passwordHash: string;
  const users: string[] = [];
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
    const email = `${randomUUID()}@draft-http.test`;
    const user = await db.user({
      email,
      passwordHash,
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
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const next = module.createNestApplication();
    configureApp(next, { docs: false, logRequests: false });
    await next.init();
    return next;
  }
  // Holds the user lock in a transaction, like `SELECT ... FOR UPDATE`.
  const blockUser = (id: string) => Gate.lockUser(db.client, id);
  const auditIds = async (filter: object) =>
    (await db.c.audit_events.find(filter).toArray()).map((a) => a._id);

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
    db = await MongoFixtures.connect();
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
    if (db) {
      const books = (
        await db.c.catalog_books.find({ requesterId: { $in: users } }).toArray()
      ).map((b) => b._id);
      const revisions = (
        await db.c.catalog_revisions.find({ bookId: { $in: books } }).toArray()
      ).map((r) => r._id);
      const listings = (
        await db.c.listings.find({ ownerId: { $in: users } }).toArray()
      ).map((l) => l._id);
      const audits = await auditIds({ actorId: { $in: users } });
      await db.c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await db.c.audit_events.deleteMany({ _id: { $in: audits } });
      await db.c.mutation_receipts.deleteMany({ actorId: { $in: users } });
      await db.c.catalog_decisions.deleteMany({
        revisionId: { $in: revisions },
      });
      await db.c.catalog_revisions.deleteMany({ _id: { $in: revisions } });
      await db.c.catalog_books.deleteMany({ _id: { $in: books } });
      await db.c.revision_media.deleteMany({ listingId: { $in: listings } });
      await db.c.listing_media.deleteMany({ listingId: { $in: listings } });
      await db.c.listing_revisions.deleteMany({
        listingId: { $in: listings },
      });
      await db.c.listings.deleteMany({ _id: { $in: listings } });
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
  });

  it('creates, independently confirms, searches and privately reads catalog with contract responses', async () => {
    const created = await createCatalog(m1, metadata('Đường ra biển'));
    await get(`/catalog/books/${created.entityId}`).expect(404);
    const own = await get(
      `/me/catalog-requests/${created.entityId}`,
      m1,
    ).expect(200);
    validates('PrivateCatalogRequest', own.body);
    await get(`/me/catalog-requests/${created.entityId}`, m2).expect(404);
    const queue = await get('/operations/catalog-requests', a1).expect(200);
    validates('CatalogRequestPage', queue.body);
    expect(queue.body.items.map((b: any) => b.id)).toContain(created.entityId);
    const detail = await get(
      `/operations/catalog-requests/${created.entityId}`,
      a1,
    ).expect(200);
    validates('PrivateCatalogRequest', detail.body);
    const confirmed = await confirm(created).expect(200);
    validates('MutationReceipt', confirmed.body);
    const book = await get(`/catalog/books/${created.entityId}`).expect(200);
    validates('PublicBook', book.body);
    expect(book.body).not.toHaveProperty('requesterId');
    expect(book.headers['cache-control']).toBe('no-store');
    const found = await get('/catalog/books')
      .query({ q: 'DUONG RA BIEN' })
      .expect(200);
    validates('BookPage', found.body);
    expect(found.body.items.map((b: any) => b.id)).toContain(created.entityId);
    const mine = await get('/me/catalog-requests', m1).expect(200);
    validates('CatalogRequestPage', mine.body);
  });

  it('rejects catalog with a reason and preserves decisions across resubmission', async () => {
    const created = await createCatalog();
    await post(
      `/operations/catalog-requests/${created.entityId}/decision`,
      {
        expectedVersion: 1,
        revisionId: created.revisionId,
        decision: 'Reject',
        reason: 'Chưa đúng thông tin của ấn bản sách.',
      },
      a1,
    ).expect(200);
    const next = await post(
      `/catalog/requests/${created.entityId}/resubmit`,
      { expectedVersion: 2, metadata: metadata('Ấn bản đã sửa') },
      m1,
    ).expect(200);
    expect(next.body.revisionId).not.toBe(created.revisionId);
    const own = await get(
      `/me/catalog-requests/${created.entityId}`,
      m1,
    ).expect(200);
    expect(own.body.decisions).toHaveLength(1);
    expect(own.body.currentRevision.number).toBe(2);
    await confirm(next.body).expect(200);
    await post(
      `/catalog/requests/${created.entityId}/resubmit`,
      { expectedVersion: 4, metadata: metadata() },
      m1,
    ).expect(409);
  });

  it('saves a partial draft and restores it from the database after an API restart', async () => {
    const b = await createCatalog();
    await confirm(b).expect(200);
    const created = await createDraft(m1, draft(b.entityId));
    const content = {
      ...draft(b.entityId),
      description: 'Đang viết dở',
      pages: 'Đủ trang',
    };
    await put(created.entityId, { expectedVersion: 1, content }, m1).expect(
      200,
    );
    await app.close();
    app = await makeApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: m1.email, password: PASSWORD })
      .expect(200);
    const fresh = { ...m1, token: login.body.accessToken };
    const result = await get(`/me/listings/${created.entityId}`, fresh).expect(
      200,
    );
    validates('PrivateListing', result.body);
    expect(result.body.currentRevision.content).toEqual(content);
    expect(result.body.version).toBe(2);
    const mine = await get('/me/listings', m1).expect(200);
    validates('PrivateListingPage', mine.body);
    expect(mine.body.items.map((l: any) => l.id)).toContain(created.entityId);
    const history = await get(
      `/me/listings/${created.entityId}/revisions`,
      m1,
    ).expect(200);
    validates('ListingRevisionPage', history.body);
  });

  it('enforces ownership, keeps public reads unavailable and validates submission', async () => {
    const created = await createDraft();
    for (const suffix of ['', '/revisions'])
      await get(`/me/listings/${created.entityId}${suffix}`, m2).expect(404);
    await put(
      created.entityId,
      { expectedVersion: 1, content: draft() },
      m2,
    ).expect(404);
    await get(`/me/listings/${created.entityId}`).expect(401);
    const outsider = await get('/me/listings', m2).expect(200);
    expect(outsider.body.items.map((l: any) => l.id)).not.toContain(
      created.entityId,
    );
    await get(`/listings/${created.entityId}`, m1).expect(404);
    await post(
      `/listings/${created.entityId}/submit`,
      { expectedVersion: 1, ownershipDeclared: true },
      m1,
    ).expect(422);
  });

  it('blocks role escalation, self review and restricted writes while retaining owner reads', async () => {
    for (const actor of [m1, staff, tester]) {
      await get('/operations/catalog-requests', actor).expect(403);
    }
    for (const actor of [staff, tester, a2])
      await post('/listings', { content: draft() }, actor).expect(403);
    const own = await createCatalog(a1);
    await confirm(own, a1).expect(403);
    await post(
      '/catalog/requests',
      { metadata: metadata() },
      restricted,
    ).expect(403);
    await post('/listings', { content: draft() }, restricted).expect(403);
    const member = await reader(),
      l = await createDraft(member);
    await db.setStatus(member.id, 'RESTRICTED');
    await get(`/me/listings/${l.entityId}`, member).expect(200);
    await put(
      l.entityId,
      { expectedVersion: 1, content: draft() },
      member,
    ).expect(403);
    await db.setStatus(member.id, 'LOCKED');
    const error = await get(`/me/listings/${l.entityId}`, member).expect(403);
    validates('ListingApiError', error.body);
  });

  it('validates canonical ISBN/checksum and races two independent confirmations of the same ISBN', async () => {
    const first = await createCatalog(m1, {
        ...metadata(),
        isbn: '0-306-40615-2',
      }),
      second = await createCatalog(m2, {
        ...metadata(),
        isbn: '9780306406157',
      });
    const statuses = await Promise.all([
      confirm(first, a1),
      confirm(second, a2),
    ]);
    expect(statuses.map((r) => r.status).sort()).toEqual([200, 409]);
    const failed = statuses.find((r) => r.status === 409)!;
    expect(failed.body.code).toBe('CatalogDuplicate');
    validates('ListingApiError', failed.body);
    const found = await get('/catalog/books')
      .query({ q: '0-306-40615-2' })
      .expect(200);
    expect(found.body.items).toHaveLength(1);
    expect(found.body.items[0].isbn).toBe('9780306406157');
    await post(
      '/catalog/requests',
      { metadata: { ...metadata(), isbn: '0000000000000' } },
      m1,
    ).expect(422);
    const invalidBook = await createCatalog();
    // The catalog_isbn_valid CHECK is a collection validator rule (121).
    await expect(
      db.c.catalog_revisions.insertOne({
        _id: randomUUID(),
        ...metadata(),
        bookId: invalidBook.entityId,
        number: 2,
        isbn: '0000000000000',
        submittedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 121 });
    await post(
      '/catalog/requests',
      { metadata: { ...metadata(), isbn: '9780306406158' } },
      m1,
    ).expect(422);
    await post(
      '/catalog/requests',
      { metadata: { ...metadata(), isbn: '9780306406157' } },
      m1,
    ).expect(409);
  });

  it('returns safe field validation, rejects unknown fields and malformed queries/keys', async () => {
    const invalid = await post(
      '/catalog/requests',
      { metadata: { ...metadata(), title: ' ', language: 'not a tag' } },
      m1,
    ).expect(422);
    validates('ListingApiError', invalid.body);
    expect(invalid.body.fieldErrors[0].path).toBe('/metadata/language');
    await post('/listings', { content: draft(), ownerId: m2.id }, m1).expect(
      422,
    );
    await post(
      '/listings',
      { content: { ...draft(), salePrice: 10000 } },
      m1,
    ).expect(422);
    await post(
      '/listings',
      { content: { ...draft(), mediaIds: [randomUUID()] } },
      m1,
    ).expect(422);
    await post('/listings', { content: draft() }, m1, 'not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${m1.token}`)
      .send({ content: draft() })
      .expect(400);
    await get('/me/listings/not-a-uuid', m1).expect(400);
    for (const query of [
      { limit: 51 },
      { unknown: 'value' },
      { moderation: 'ApprovedUnexpected' },
    ])
      await get('/me/listings', m1).query(query).expect(400);
  });

  it('never allows another private or rejected catalog to be attached to a draft', async () => {
    const pending = await createCatalog(m2);
    await post('/listings', { content: draft(pending.entityId) }, m1).expect(
      404,
    );
    await createDraft(m2, draft(pending.entityId));
    await post(
      `/operations/catalog-requests/${pending.entityId}/decision`,
      {
        expectedVersion: 1,
        revisionId: pending.revisionId,
        decision: 'Reject',
        reason: 'Thiếu thông tin nhận biết ấn bản.',
      },
      a1,
    ).expect(200);
    await post('/listings', { content: draft(pending.entityId) }, m2).expect(
      404,
    );
    const l = await createDraft();
    await put(
      l.entityId,
      { expectedVersion: 1, content: { ...draft(), mediaIds: [randomUUID()] } },
      m1,
    ).expect(422);
  });

  it('deduplicates concurrent HTTP creates and replays an old version without new effects', async () => {
    const key = randomUUID(),
      body = { content: draft() };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => post('/listings', body, m1, key)),
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    expect(new Set(results.map((r) => r.body.entityId)).size).toBe(1);
    expect(
      results.filter((r) => r.headers['idempotency-replayed'] === 'false'),
    ).toHaveLength(1);
    const id = results[0].body.entityId,
      saveKey = randomUUID(),
      save = {
        expectedVersion: 1,
        content: { ...draft(), pages: ' Đủ trang ' },
      };
    const saved = await put(id, save, m1, saveKey).expect(200);
    const replay = await put(
      id,
      { content: { ...draft(), pages: 'Đủ trang' }, expectedVersion: 1 },
      m1,
      saveKey,
    ).expect(200);
    expect(replay.body).toEqual(saved.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await put(id, { ...save, expectedVersion: 2 }, m1, saveKey).expect(409);
    const receipts = await db.c.mutation_receipts
      .find({ listingId: id })
      .toArray();
    expect(receipts).toHaveLength(2);
    expect(await db.c.audit_events.countDocuments({ listingId: id })).toBe(2);
  });

  it('fingerprints target IDs and scopes keys by actor and operation', async () => {
    const one = await createDraft(),
      two = await createDraft(),
      key = randomUUID();
    await put(
      one.entityId,
      { expectedVersion: 1, content: draft() },
      m1,
      key,
    ).expect(200);
    await put(
      two.entityId,
      { expectedVersion: 1, content: draft() },
      m1,
      key,
    ).expect(409);
    await post('/listings', { content: draft() }, m2, key).expect(200);
    await post('/catalog/requests', { metadata: metadata() }, m1, key).expect(
      200,
    );
  });

  it('replays a committed save after its catalog is rejected without revalidating the old intent', async () => {
    const b = await createCatalog();
    const l = await createDraft(m1, draft(b.entityId));
    const key = randomUUID(),
      body = { expectedVersion: 1, content: draft(b.entityId) };
    const saved = await put(l.entityId, body, m1, key).expect(200);
    await post(
      `/operations/catalog-requests/${b.entityId}/decision`,
      {
        expectedVersion: 1,
        revisionId: b.revisionId,
        decision: 'Reject',
        reason: 'Ấn bản cần bổ sung thông tin.',
      },
      a1,
    ).expect(200);
    const replay = await put(l.entityId, body, m1, key).expect(200);
    expect(replay.body).toEqual(saved.body);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await put(l.entityId, { ...body, expectedVersion: 2 }, m1).expect(404);
    expect(
      await db.c.audit_events.countDocuments({ listingId: l.entityId }),
    ).toBe(2);
  });

  it('retries write conflicts within a bounded budget with atomic effects', async () => {
    // MongoDB reports contention as TransientTransactionError (write conflict)
    // rather than SQLSTATE 40001. A user-lock gate produces real conflicts: a
    // command that gets through retries a few times and commits once; one kept
    // out past the finite retry budget (ADR 0027) fails with 503 and no effects.
    const recoverable = await reader(),
      blocked = await reader();
    const attempts = new Map<number, number>();
    const stop = onTransactionRetry(({ transactionId, attempt }) =>
      attempts.set(
        transactionId,
        Math.max(attempt, attempts.get(transactionId) ?? 0),
      ),
    );
    const failedKey = randomUUID();
    try {
      let gate = await blockUser(recoverable.id);
      try {
        const pending = post('/listings', { content: draft() }, recoverable);
        const response = pending.then((r) => r);
        await gate.contended();
        // Let the command fail at least twice before the lock is released.
        const deadline = Date.now() + 4000;
        while (Math.max(0, ...attempts.values()) < 2 && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 5));
        await gate.commit();
        const success = await response;
        expect(success.status).toBe(200);
        validates('MutationReceipt', success.body);
        expect(Math.max(...attempts.values())).toBeGreaterThanOrEqual(2);
        expect(
          await db.c.listings.countDocuments({ ownerId: recoverable.id }),
        ).toBe(1);
        expect(
          await db.c.audit_events.countDocuments({
            listingId: success.body.entityId,
          }),
        ).toBe(1);
      } finally {
        await gate.close();
      }
      attempts.clear();
      gate = await blockUser(blocked.id);
      try {
        const error = await post(
          '/listings',
          { content: draft() },
          blocked,
          failedKey,
        ).expect(503);
        validates('ListingApiError', error.body);
        // Bounded: the executor gives up (maxAttempts / retry budget).
        expect(attempts.size).toBe(1);
        expect(Math.max(...attempts.values())).toBeLessThan(60);
        expect(
          await db.c.listings.countDocuments({ ownerId: blocked.id }),
        ).toBe(0);
        expect(
          await db.c.mutation_receipts.countDocuments({ key: failedKey }),
        ).toBe(0);
      } finally {
        await gate.close();
      }
    } finally {
      stop();
    }
    await post('/listings', { content: draft() }, blocked, failedKey).expect(
      200,
    );
  });

  it('allows exactly one HTTP update from two sessions holding the same expectedVersion', async () => {
    const l = await createDraft();
    const sessionId = await db.session(m1.id);
    const secondSession = {
      ...m1,
      sessionId,
      token: await app
        .get(JwtService)
        .signAsync({ sub: m1.id, sid: sessionId }),
    };
    const key1 = randomUUID(),
      key2 = randomUUID();
    const results = await Promise.all([
      put(
        l.entityId,
        { expectedVersion: 1, content: { ...draft(), pages: 'Phiên một' } },
        m1,
        key1,
      ),
      put(
        l.entityId,
        { expectedVersion: 1, content: { ...draft(), pages: 'Phiên hai' } },
        secondSession,
        key2,
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = await get(`/me/listings/${l.entityId}`, m1).expect(200);
    expect(current.body.version).toBe(2);
    expect(
      await db.c.audit_events.countDocuments({ listingId: l.entityId }),
    ).toBe(2);
  });

  it('serializes competing Admin decisions on the same catalog revision', async () => {
    const b = await createCatalog();
    const results = await Promise.all([
      confirm(b, a1),
      post(
        `/operations/catalog-requests/${b.entityId}/decision`,
        {
          expectedVersion: 1,
          revisionId: b.revisionId,
          decision: 'Reject',
          reason: 'Thông tin ấn bản cần kiểm tra lại.',
        },
        a2,
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await db.c.catalog_decisions.countDocuments({
        revisionId: b.revisionId,
      }),
    ).toBe(1);
    const audits = await auditIds({ bookId: b.entityId });
    expect(audits).toHaveLength(2);
    expect(
      await db.c.outbox_events.countDocuments({ auditId: { $in: audits } }),
    ).toBe(2);
  });

  it('rechecks account status after the authentication guard while blocked at a transaction lock', async () => {
    const actor = await reader(),
      key = randomUUID();
    const gate = await blockUser(actor.id);
    const pending = post('/listings', { content: draft() }, actor, key).then(
      (r) => r,
    );
    try {
      await gate.contended();
      await gate.db
        .collection<{ _id: string }>('users')
        .updateOne(
          { _id: actor.id },
          { $set: { status: 'RESTRICTED' } },
          { session: gate.session },
        );
      await gate.commit();
      expect((await pending).status).toBe(403);
      expect(await db.c.mutation_receipts.countDocuments({ key })).toBe(0);
    } finally {
      await gate.close();
      await pending;
    }
  });

  it('rechecks session revocation after a stale guard result without committing any draft', async () => {
    const actor = await reader(),
      key = randomUUID();
    const gate = await blockUser(actor.id);
    const pending = post('/listings', { content: draft() }, actor, key).then(
      (r) => r,
    );
    try {
      await gate.contended();
      await gate.db
        .collection<{ _id: string }>('auth_sessions')
        .updateOne(
          { _id: actor.sessionId },
          { $set: { revokedAt: new Date() } },
          { session: gate.session },
        );
      await gate.commit();
      expect((await pending).status).toBe(401);
      expect(await db.c.mutation_receipts.countDocuments({ key })).toBe(0);
    } finally {
      await gate.close();
      await pending;
    }
  });

  it('rechecks Admin role after a stale guard and blocks replay after role revocation', async () => {
    const actor = await reader(['ADMIN']),
      b = await createCatalog(),
      key = randomUUID();
    const body = {
      expectedVersion: 1,
      revisionId: b.revisionId,
      decision: 'Confirm',
    };
    const gate = await blockUser(actor.id);
    const pending = post(
      `/operations/catalog-requests/${b.entityId}/decision`,
      body,
      actor,
      key,
    ).then((r) => r);
    try {
      await gate.contended();
      await gate.db
        .collection<{ _id: string }>('users')
        .updateOne(
          { _id: actor.id },
          { $pull: { roles: { role: 'ADMIN' } } } as never,
          { session: gate.session },
        );
      await gate.commit();
      expect((await pending).status).toBe(403);
      expect(
        await db.c.catalog_decisions.countDocuments({
          revisionId: b.revisionId,
        }),
      ).toBe(0);
    } finally {
      await gate.close();
      await pending;
    }
    await db.addRole(actor.id, 'ADMIN');
    await post(
      `/operations/catalog-requests/${b.entityId}/decision`,
      body,
      actor,
      key,
    ).expect(200);
    await db.removeRole(actor.id, 'ADMIN');
    await post(
      `/operations/catalog-requests/${b.entityId}/decision`,
      body,
      actor,
      key,
    ).expect(403);
  });

  it('makes role writers participate in the user lock used by commands', async () => {
    // Roles are embedded in the user document (MIG02_MODEL_MAP
    // role_mutation_lock), so any role writer must write the locked document
    // and waits until the lock holder finishes.
    const actor = await reader();
    const gate = await blockUser(actor.id);
    let settled = false;
    const pending = db.removeRole(actor.id, 'MEMBER').finally(() => {
      settled = true;
    });
    void pending.catch(() => {});
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);
      const user = await db.c.users.findOne({ _id: actor.id });
      expect(user!.roles.filter((r) => r.role === 'MEMBER')).toHaveLength(1);
      await gate.commit();
      await pending;
      expect((await db.c.users.findOne({ _id: actor.id }))!.roles).toHaveLength(
        0,
      );
    } finally {
      await gate.close();
      await pending.catch(() => {});
    }
  });

  it('rolls back business data and receipt when audit insertion fails, then safely retries the same key', async () => {
    // Test-only failure injection using a narrowly matched temporary validator rule.
    const key = randomUUID(),
      actor = await reader();
    await db.withRejectingValidator(
      'audit_events',
      { actorId: actor.id },
      async () => {
        const error = await post(
          '/listings',
          { content: draft() },
          actor,
          key,
        ).expect(500);
        expect(JSON.stringify(error.body)).not.toContain(
          'Document failed validation',
        );
        expect(await db.c.listings.countDocuments({ ownerId: actor.id })).toBe(
          0,
        );
        expect(await db.c.mutation_receipts.countDocuments({ key })).toBe(0);
      },
    );
    await post('/listings', { content: draft() }, actor, key).expect(200);
  });

  it('uses signed scope-bound keyset cursors, preserves precision and treats search wildcards literally', async () => {
    const actor = await reader();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const l = await createDraft(actor);
      ids.push(l.entityId);
      // BSON dates have millisecond precision; adjacent keys 1 ms apart.
      await db.c.listings.updateOne(
        { _id: l.entityId },
        {
          $set: { updatedAt: new Date(`2026-09-26T00:00:00.00${i + 1}Z`) },
          $inc: { version: 1, lockSeq: 1 },
        },
      );
    }
    const first = await get('/me/listings', actor)
      .query({ limit: 1 })
      .expect(200);
    const second = await get('/me/listings', actor)
      .query({ limit: 1, cursor: first.body.nextCursor })
      .expect(200);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    const third = await get('/me/listings', actor)
      .query({ limit: 1, cursor: second.body.nextCursor })
      .expect(200);
    expect([first, second, third].map((p) => p.body.items[0].id)).toEqual(
      ids.reverse(),
    );
    expect(third.body.nextCursor).toBeNull();
    await get('/me/listings', m2)
      .query({ cursor: first.body.nextCursor })
      .expect(400);
    await get('/me/listings', actor)
      .query({ cursor: first.body.nextCursor, moderation: 'Draft' })
      .expect(400);
    await get('/me/listings', actor)
      .query({ cursor: first.body.nextCursor + 'x' })
      .expect(400);
    const book = await createCatalog(m1, metadata('Chuyện 100% _ thật'));
    await confirm(book).expect(200);
    const found = await get('/catalog/books')
      .query({ q: '100% _' })
      .expect(200);
    expect(found.body.items.map((b: any) => b.id)).toEqual([book.entityId]);
    const page = await get('/catalog/books').query({ limit: 1 }).expect(200);
    if (page.body.nextCursor)
      await get('/catalog/books')
        .query({ limit: 1, cursor: page.body.nextCursor })
        .expect(200);
  });
});
