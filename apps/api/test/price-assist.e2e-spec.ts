import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hash } from 'argon2';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import {
  PriceModel,
  PriceModelError,
  type ModelDraft,
} from '../src/modules/price-assist/price-model.js';
import { validates } from './helpers/contract.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// Fake provider: exercises adapter/failure paths only. Live evidence comes from
// the eval runner against the real provider (docs/features/PRICE_ASSIST_REPORT.md).
class FakeModel extends PriceModel {
  readonly model = 'fake-price-model';
  mode: 'ok' | 'invalid' | 'timeout' | 'slow' = 'ok';
  calls = 0;
  prompts: string[] = [];
  async draft(_system: string, user: string): Promise<ModelDraft> {
    this.calls++;
    this.prompts.push(user);
    if (this.mode === 'timeout')
      throw new PriceModelError('Timeout', 'fake timeout');
    if (this.mode === 'slow') await new Promise((r) => setTimeout(r, 400));
    const data = JSON.parse(user.slice(user.indexOf('{'), user.lastIndexOf('}') + 1));
    const output =
      this.mode === 'invalid'
        ? { low: 1, high: 2, factors: [], missing: [], confidence: 0.9 }
        : {
            low: data.bounds.low + 20_000,
            high: data.bounds.low + 40_000,
            factors: [
              { text: 'Dựa trên giá bìa và tình trạng.', sourceRefs: ['s1', 'condition'] },
            ],
            missing: [],
          };
    return { output, model: this.model, inputTokens: 900, outputTokens: 300 };
  }
}

type Reader = { id: string; token: string; email: string };
const PASSWORD = 'Only-a-test-password-2026';
const draft = (bookId: string | null, salePrice: number | null = null) => ({
  bookId,
  mode: salePrice === null ? null : 'Sale',
  condition: 'Good',
  pages: '',
  coverNote: '',
  notes: '',
  accessories: '',
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  description: '',
  salePrice,
  exchangeValue: null,
  mediaIds: [] as string[],
});

describe('price suggestions through HTTP with MongoDB', () => {
  let app: INestApplication, db: MongoFixtures, passwordHash: string;
  const fake = new FakeModel();
  const users: string[] = [];
  const books: string[] = [];
  let m1: Reader, m2: Reader, admin: Reader, staff: Reader, restricted: Reader;
  let bookId: string, emptyBookId: string;

  const post = (path: string, body: object, actor: Reader, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const put = (path: string, body: object, actor: Reader, key = randomUUID()) =>
    request(app.getHttpServer())
      .put('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const ask = (
    listingId: string,
    actor: Reader,
    over: object = {},
    key: string = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/listings/${listingId}/price-suggestions`)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send({
        bookId,
        condition: 'Good',
        readable: true,
        hasMissingPages: false,
        missingEssentialContent: false,
        conditionNote: '',
        ...over,
      });

  async function reader(
    roles: RoleCode[] = ['MEMBER'],
    status: UserStatus = 'ACTIVE',
  ): Promise<Reader> {
    const email = `${randomUUID()}@price-assist.test`;
    const user = await db.user({ email, passwordHash, displayName: 'Người bán thử', roles, status });
    users.push(user._id);
    const sessionId = await db.session(user._id);
    const token = await app.get(JwtService).signAsync({ sub: user._id, sid: sessionId });
    return { id: user._id, token, email };
  }
  async function confirmedBook(title: string, isbn: string | null) {
    const created = await post(
      '/catalog/requests',
      {
        metadata: {
          title,
          authors: ['Tác giả thử'],
          publisher: null,
          publicationYear: 2021,
          language: 'vi',
          edition: isbn ? 'Tái bản 2021' : null,
          category: 'Văn học',
          isbn,
        },
      },
      m1,
    ).expect(200);
    await post(
      `/operations/catalog-requests/${created.body.entityId}/decision`,
      { expectedVersion: created.body.version, revisionId: created.body.revisionId, decision: 'Confirm' },
      admin,
    ).expect(200);
    books.push(created.body.entityId);
    return created.body.entityId as string;
  }
  // Listings get one Ready photo by default: the assistant prices only a
  // copy the seller has photographed (R-NEED-PHOTO otherwise).
  async function listing(actor = m1, book = bookId, photo = true) {
    const res = await post('/listings', { content: draft(book) }, actor).expect(200);
    const created = res.body as { entityId: string; version: number };
    if (photo) {
      const id = randomUUID();
      const now = new Date();
      await db.c.listing_media.insertOne({
        _id: id,
        listingId: created.entityId,
        version: 1,
        status: 'Ready',
        stagingKey: `e2e/staging/${id}`,
        pinnedKey: `e2e/pinned/${id}`,
        derivativeKey: `e2e/derived/${id}`,
        mimeType: 'image/jpeg',
        byteSize: 1000,
        sha256: 'a'.repeat(64),
        width: 800,
        height: 600,
        failureCode: null,
        expiresAt: new Date(now.getTime() + 86_400_000),
        purgedAt: null,
        reservedBytes: 0,
        createdAt: now,
        updatedAt: now,
        lockSeq: 0,
      });
    }
    return created;
  }
  const reference = (book: string, amount: number, kind = 'EditorialReference', label = 'Biên tập') => ({
    _id: randomUUID(),
    bookId: book,
    isbn: null,
    kind: kind as 'EditorialReference',
    amount,
    condition: null,
    sourceLabel: label,
    sourceUrl: null,
    observedAt: new Date(Date.now() - 20 * 86_400_000),
    enteredBy: 'e2e',
    rightsNote: 'Test fixture only',
    retiredAt: null,
    createdAt: new Date(),
  });
  const today = () => new Date().toISOString().slice(0, 10);
  // Random valid ISBN-13, so reruns never collide with a confirmed duplicate.
  const isbn13 = () => {
    const body = '978' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    const sum = [...body].reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0);
    return body + ((10 - (sum % 10)) % 10);
  };

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
    db = await MongoFixtures.connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PriceModel)
      .useValue(fake)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    m1 = await reader();
    m2 = await reader();
    admin = await reader(['MEMBER', 'ADMIN']);
    staff = await reader(['STAFF']);
    restricted = await reader(['MEMBER'], 'RESTRICTED');
    bookId = await confirmedBook('Sách có giá tham chiếu', isbn13());
    emptyBookId = await confirmedBook('Sách chưa có dữ liệu giá', null);
    await db.c.price_references.insertMany([
      reference(bookId, 98_000, 'CoverPrice', 'NXB'),
      reference(bookId, 60_000, 'EditorialReference', 'Biên tập A'),
      reference(bookId, 65_000, 'EditorialReference', 'Biên tập B'),
    ]);
  }, 60000);
  afterAll(async () => {
    if (db) {
      const listings = (await db.c.listings.find({ ownerId: { $in: users } }).toArray()).map((l) => l._id);
      const audits = (await db.c.audit_events.find({ actorId: { $in: users } }).toArray()).map((a) => a._id);
      await db.c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await db.c.audit_events.deleteMany({ _id: { $in: audits } });
      await db.c.mutation_receipts.deleteMany({ actorId: { $in: users } });
      await db.c.price_suggestions.deleteMany({ ownerId: { $in: users } });
      await db.c.price_references.deleteMany({ bookId: { $in: books } });
      await db.c.price_assist_usage.deleteMany({});
      await db.c.listing_media.deleteMany({ listingId: { $in: listings } });
      await db.c.listing_revisions.deleteMany({ listingId: { $in: listings } });
      await db.c.listings.deleteMany({ _id: { $in: listings } });
      const revisions = (await db.c.catalog_revisions.find({ bookId: { $in: books } }).toArray()).map((r) => r._id);
      await db.c.catalog_decisions.deleteMany({ revisionId: { $in: revisions } });
      await db.c.catalog_revisions.deleteMany({ _id: { $in: revisions } });
      await db.c.catalog_books.deleteMany({ _id: { $in: books } });
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
  });
  beforeEach(async () => {
    fake.mode = 'ok';
    await db.c.price_assist_usage.deleteMany({});
  });

  it('denies other members, non-members, restricted accounts and unusable books', async () => {
    const l = await listing();
    await ask(l.entityId, m2).expect(404);
    await ask(l.entityId, staff).expect(403);
    await ask(l.entityId, restricted).expect(403);
    const res = await ask(l.entityId, m1, { bookId: randomUUID() }).expect(422);
    expect(res.body.fieldErrors?.[0]?.path ?? res.body.message).toBeTruthy();
    expect(fake.calls).toBe(0);
  });

  it('answers missing data and refusals by rule without calling the provider', async () => {
    const l = await listing(m1, emptyBookId);
    const none = await ask(l.entityId, m1, { bookId: emptyBookId }).expect(200);
    validates('PriceSuggestion', none.body);
    expect(none.body).toMatchObject({ status: 'NeedsMoreData', range: null, model: null });
    expect(none.body.rules).toContain('R-NEED-SOURCES');
    const l2 = await listing();
    const refused = await ask(l2.entityId, m1, { readable: false }).expect(200);
    expect(refused.body).toMatchObject({ status: 'Refused', range: null });
    const bare = await listing(m1, bookId, false);
    const noPhoto = await ask(bare.entityId, m1).expect(200);
    expect(noPhoto.body).toMatchObject({ status: 'NeedsMoreData', range: null, model: null });
    expect(noPhoto.body.rules).toContain('R-NEED-PHOTO');
    expect(fake.calls).toBe(0);
  });

  it('suggests a bounded, sourced range once, then serves the cache; new input invalidates it', async () => {
    const l = await listing();
    const first = await ask(l.entityId, m1, {
      conditionNote: 'Gáy hơi sờn. Liên hệ 0901234567 hoặc x@y.vn',
    }).expect(200);
    validates('PriceSuggestion', first.body);
    expect(first.body).toMatchObject({ status: 'Suggested', listingId: l.entityId, cached: false, model: 'fake-price-model' });
    expect(first.body.range.low).toBeGreaterThanOrEqual(10_000);
    expect(first.body.sources.map((s: any) => s.kind)).toEqual(
      expect.arrayContaining(['CoverPrice', 'EditorialReference']),
    );
    // No contact or account data reaches the provider.
    const prompt = fake.prompts.at(-1)!;
    for (const secret of ['0901234567', 'x@y.vn', m1.email, m1.id, l.entityId])
      expect(prompt).not.toContain(secret);
    const calls = fake.calls;
    const again = await ask(l.entityId, m1, {
      conditionNote: 'Gáy hơi sờn. Liên hệ 0901234567 hoặc x@y.vn',
    }).expect(200);
    // A new key for the same input reuses the answer under its own id.
    expect(again.body).toMatchObject({ cached: true, range: first.body.range });
    expect(again.body.id).not.toBe(first.body.id);
    expect(fake.calls).toBe(calls);
    const fair = await ask(l.entityId, m1, { condition: 'Fair' }).expect(200);
    expect(fair.body.inputFingerprint).not.toBe(first.body.inputFingerprint);
    expect(fake.calls).toBe(calls + 1);
    const usage = await db.c.price_assist_usage.findOne({ _id: `user:${m1.id}:${today()}` });
    expect(usage).toMatchObject({ calls: 2 });
    expect(usage!.costMicroUsd).toBeGreaterThan(0);
  });

  it('replays by Idempotency-Key and rejects a key reused for another body', async () => {
    const l = await listing();
    const key = randomUUID();
    const first = await ask(l.entityId, m1, { condition: 'LikeNew', conditionNote: 'k' }, key).expect(200);
    const calls = fake.calls;
    const replay = await ask(l.entityId, m1, { condition: 'LikeNew', conditionNote: 'k' }, key).expect(200);
    expect(replay.body).toMatchObject({ id: first.body.id, cached: true });
    expect(fake.calls).toBe(calls);
    const conflict = await ask(l.entityId, m1, { condition: 'Fair', conditionNote: 'k' }, key).expect(409);
    expect(conflict.body.code).toBe('IdempotencyConflict');
    // Keys are scoped by member: another member's key space is separate.
    const other = await listing(m2);
    await ask(other.entityId, m2, { condition: 'LikeNew', conditionNote: 'k' }, key).expect(200);
    // Missing key is a contract error, never a silent new request.
    await request(app.getHttpServer())
      .post(`/api/v1/listings/${l.entityId}/price-suggestions`)
      .set('Authorization', `Bearer ${m1.token}`)
      .send({ bookId, condition: 'Good', readable: true, hasMissingPages: false, missingEssentialContent: false })
      .expect(400);
    // A failed request replays its failure under the same key.
    fake.mode = 'invalid';
    const failKey = randomUUID();
    await ask(l.entityId, m1, { condition: 'Worn', conditionNote: 'f' }, failKey).expect(503);
    fake.mode = 'ok';
    const failCalls = fake.calls;
    await ask(l.entityId, m1, { condition: 'Worn', conditionNote: 'f' }, failKey).expect(503);
    expect(fake.calls).toBe(failCalls);
  });

  it('returns 503 for invalid output or timeout and records the failure', async () => {
    const l = await listing();
    fake.mode = 'invalid';
    const bad = await ask(l.entityId, m1, { condition: 'LikeNew' }).expect(503);
    expect(bad.body.code).toBe('UNAVAILABLE');
    fake.mode = 'timeout';
    await ask(l.entityId, m1, { condition: 'Worn' }).expect(503);
    const failed = await db.c.price_suggestions
      .find({ listingId: l.entityId, status: 'Failed' })
      .toArray();
    expect(failed.map((f) => f.failure).sort()).toEqual(['InvalidOutput', 'Timeout']);
    expect(failed.every((f) => f.rangeLow === null && f.response === null)).toBe(true);
  });

  it('enforces the per-user daily limit and the global budget without leaking increments', async () => {
    const l = await listing();
    const expiresAt = new Date(Date.now() + 2 * 86_400_000);
    await db.c.price_assist_usage.insertOne({ _id: `user:${m1.id}:${today()}`, calls: 20, costMicroUsd: 0, expiresAt });
    const limited = await ask(l.entityId, m1, { condition: 'LikeNew' }).expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(await db.c.price_assist_usage.findOne({ _id: `user:${m1.id}:${today()}` })).toMatchObject({ calls: 20 });
    await db.c.price_assist_usage.deleteMany({});
    await db.c.price_assist_usage.insertOne({ _id: `global:${today()}`, calls: 1, costMicroUsd: 2_000_000, expiresAt });
    await ask(l.entityId, m1, { condition: 'LikeNew' }).expect(503);
  });

  it('serializes concurrent calls from one member: one provider call, the other waits', async () => {
    const l = await listing();
    fake.mode = 'slow';
    const calls = fake.calls;
    const results = await Promise.all([
      ask(l.entityId, m1, { condition: 'Fair', conditionNote: 'a' }),
      ask(l.entityId, m1, { condition: 'Fair', conditionNote: 'b' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(fake.calls).toBe(calls + 1);
  });

  it('records the seller decision atomically with the draft save; replay and foreign ids', async () => {
    const l = await listing();
    const s = (await ask(l.entityId, m1, { condition: 'Good', conditionNote: 'decision' }).expect(200)).body;
    const price = s.range.low;
    const key = randomUUID();
    const body = {
      expectedVersion: l.version,
      content: draft(bookId, price),
      priceAssist: { suggestionId: s.id, applied: true },
    };
    const saved = await put(`/listings/${l.entityId}/draft`, body, m1, key).expect(200);
    const replay = await put(`/listings/${l.entityId}/draft`, body, m1, key).expect(200);
    expect(replay.body).toEqual(saved.body);
    const stored = await db.c.price_suggestions.findOne({ _id: s.id });
    expect(stored!.outcome).toMatchObject({
      applied: true,
      chosenSalePrice: price,
      withinRange: true,
      revisionId: saved.body.revisionId,
    });
    // Another member's listing cannot claim this suggestion; nothing is saved.
    const other = await listing(m2);
    const denied = await put(
      `/listings/${other.entityId}/draft`,
      { expectedVersion: other.version, content: draft(bookId, 50_000), priceAssist: { suggestionId: s.id, applied: false } },
      m2,
    ).expect(422);
    expect(denied.body.fieldErrors[0].path).toBe('/priceAssist/suggestionId');
    const untouched = await db.c.listings.findOne({ _id: other.entityId });
    expect(untouched!.version).toBe(other.version);
  });

  it('rejects a decision for other inputs than the saved content or after expiry', async () => {
    const l = await listing();
    const s = (await ask(l.entityId, m1, { conditionNote: 'mismatch' }).expect(200)).body;
    const save = (content: object) =>
      put(`/listings/${l.entityId}/draft`, {
        expectedVersion: l.version,
        content,
        priceAssist: { suggestionId: s.id, applied: true },
      }, m1);
    // Suggested for "Good"; saving "Worn" must not record it as applied.
    const worn = await save({ ...draft(bookId, s.range.low), condition: 'Worn' }).expect(422);
    expect(worn.body.fieldErrors[0].path).toBe('/priceAssist/suggestionId');
    const pages = await save({ ...draft(bookId, s.range.low), hasMissingPages: true }).expect(422);
    expect(pages.body.fieldErrors[0].path).toBe('/priceAssist/suggestionId');
    await db.c.price_suggestions.updateOne(
      { _id: s.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await save(draft(bookId, s.range.low)).expect(422);
    expect((await db.c.price_suggestions.findOne({ _id: s.id }))!.outcome).toBeNull();
    expect((await db.c.listings.findOne({ _id: l.entityId }))!.version).toBe(l.version);
  });

  it('rejects requests on listings that are not editable', async () => {
    const l = await listing();
    await db.c.listings.updateOne({ _id: l.entityId }, { $set: { moderation: 'PendingReview' } });
    await ask(l.entityId, m1).expect(409);
  });
});
