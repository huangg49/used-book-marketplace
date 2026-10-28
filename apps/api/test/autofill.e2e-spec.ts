import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hash } from 'argon2';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';
import { AutofillModel } from '../src/modules/autofill-assist/autofill-model.js';
import { AutofillImages } from '../src/modules/autofill-assist/autofill-images.js';
import {
  PriceModelError,
  type ModelDraft,
} from '../src/modules/price-assist/price-model.js';
import { validates } from './helpers/contract.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// Fake provider and photo source (ADR 0048): failure/flow paths only, never
// live evidence. Live quality needs the real NIM key and real photos.
class FakeAutofill extends AutofillModel {
  readonly model = 'fake/vision';
  fallback: string | null = null;
  calls: { images: string[]; fallback: boolean }[] = [];
  output: unknown = {};
  fallbackOutput: unknown = {};
  mode: 'ok' | 'timeout' | 'slow' = 'ok';
  async read(_s: string, _u: string, images: string[], useFallback = false): Promise<ModelDraft> {
    this.calls.push({ images, fallback: useFallback });
    if (this.mode === 'timeout') throw new PriceModelError('Timeout', 'fake timeout');
    if (this.mode === 'slow') await new Promise((r) => setTimeout(r, 400));
    return {
      output: useFallback ? this.fallbackOutput : this.output,
      model: useFallback ? 'fake/fallback' : this.model,
      inputTokens: 1000,
      outputTokens: 100,
    };
  }
}
class FakeImages extends AutofillImages {
  keys: string[] = [];
  async dataUrl(key: string) {
    this.keys.push(key);
    return `data:image/jpeg;base64,${Buffer.from(key).toString('base64')}`;
  }
}

type Reader = { id: string; token: string };
const PASSWORD = 'Only-a-test-password-2026';
const draft = (bookId: string | null) => ({
  bookId,
  mode: null,
  condition: 'Good',
  pages: '',
  coverNote: '',
  notes: '',
  accessories: '',
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  description: '',
  salePrice: null,
  exchangeValue: null,
  mediaIds: [] as string[],
});
const isbn13 = () => {
  const body = '978' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  const sum = [...body].reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
};

describe('photo autofill through HTTP with MongoDB', () => {
  let app: INestApplication, db: MongoFixtures, passwordHash: string;
  const fake = new FakeAutofill();
  const images = new FakeImages();
  const users: string[] = [];
  const books: string[] = [];
  let m1: Reader, m2: Reader, admin: Reader, staff: Reader, restricted: Reader;
  let isbn: string, bookTitle: string, bookId: string;

  const post = (path: string, body: object, actor: Reader, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const ask = (listingId: string, mediaIds: string[], actor: Reader, key = randomUUID()) =>
    post(`/listings/${listingId}/autofill-suggestions`, { mediaIds }, actor, key);

  async function reader(roles: RoleCode[] = ['MEMBER'], status: UserStatus = 'ACTIVE') {
    const email = `${randomUUID()}@autofill.test`;
    const user = await db.user({ email, passwordHash, displayName: 'Người bán thử', roles, status });
    users.push(user._id);
    const sessionId = await db.session(user._id);
    const token = await app.get(JwtService).signAsync({ sub: user._id, sid: sessionId });
    return { id: user._id, token };
  }
  async function photo(listingId: string, status: 'Ready' | 'Processing' = 'Ready') {
    const id = randomUUID();
    const now = new Date();
    await db.c.listing_media.insertOne({
      _id: id,
      listingId,
      version: 1,
      status,
      stagingKey: `e2e/staging/${id}`,
      pinnedKey: `e2e/pinned/${id}`,
      derivativeKey: status === 'Ready' ? `e2e/derived/${id}` : null,
      mimeType: 'image/jpeg',
      byteSize: 1000,
      sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
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
    return id;
  }
  async function listing(actor = m1) {
    const res = await post('/listings', { content: draft(null) }, actor).expect(200);
    const id = res.body.entityId as string;
    return { id, photo: await photo(id) };
  }

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
    db = await MongoFixtures.connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AutofillModel)
      .useValue(fake)
      .overrideProvider(AutofillImages)
      .useValue(images)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    m1 = await reader();
    m2 = await reader();
    admin = await reader(['MEMBER', 'ADMIN']);
    staff = await reader(['STAFF']);
    restricted = await reader(['MEMBER'], 'RESTRICTED');
    isbn = isbn13();
    bookTitle = `Mắt biếc ${randomUUID().slice(0, 8)}`;
    const created = await post(
      '/catalog/requests',
      {
        metadata: {
          title: bookTitle,
          authors: ['Nguyễn Nhật Ánh'],
          publisher: 'NXB Trẻ',
          publicationYear: 2019,
          language: 'vi',
          edition: null,
          category: 'Văn học',
          isbn,
        },
      },
      m2,
    ).expect(200);
    await post(
      `/operations/catalog-requests/${created.body.entityId}/decision`,
      { expectedVersion: created.body.version, revisionId: created.body.revisionId, decision: 'Confirm' },
      admin,
    ).expect(200);
    bookId = created.body.entityId;
    books.push(bookId);
  }, 60000);
  afterAll(async () => {
    if (db) {
      const listings = (await db.c.listings.find({ ownerId: { $in: users } }).toArray()).map((l) => l._id);
      const audits = (await db.c.audit_events.find({ actorId: { $in: users } }).toArray()).map((a) => a._id);
      await db.c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await db.c.audit_events.deleteMany({ _id: { $in: audits } });
      await db.c.mutation_receipts.deleteMany({ actorId: { $in: users } });
      await db.c.autofill_suggestions.deleteMany({ ownerId: { $in: users } });
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
    fake.fallback = null;
    fake.calls = [];
    fake.output = {
      title: bookTitle,
      authors: ['Nguyễn Nhật Ánh'],
      publisher: 'NXB Trẻ',
      publicationYear: 2019,
      language: 'vi',
      edition: null,
      isbn,
      missing: [],
    };
    images.keys = [];
    await db.c.price_assist_usage.deleteMany({});
  });

  it('denies other members, non-members, restricted accounts and foreign or unready photos', async () => {
    const l = await listing();
    await ask(l.id, [l.photo], m2).expect(404);
    await ask(l.id, [l.photo], staff).expect(403);
    await ask(l.id, [l.photo], restricted).expect(403);
    const other = await listing(m2);
    await ask(l.id, [other.photo], m1).expect(422);
    await ask(l.id, [await photo(l.id, 'Processing')], m1).expect(422);
    // Contract validation (minItems 1) reports field errors as 422.
    await ask(l.id, [], m1).expect(422);
    expect(fake.calls).toHaveLength(0);
    expect(await db.c.autofill_suggestions.countDocuments({ listingId: l.id })).toBe(0);
  });

  it('reads the photos once, returns checked fields with catalog matches, then serves the cache', async () => {
    const l = await listing();
    const first = await ask(l.id, [l.photo], m1).expect(200);
    validates('AutofillSuggestion', first.body);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body).toMatchObject({
      status: 'Suggested',
      cached: false,
      model: 'fake/vision',
      fields: { title: bookTitle, isbn, language: 'vi' },
    });
    expect(first.body.matches[0]).toMatchObject({
      book: { id: bookId },
      matchedBy: 'Isbn',
      pending: false,
    });
    expect(fake.calls).toHaveLength(1);
    expect(images.keys).toEqual([`e2e/derived/${l.photo}`]);
    // Nothing is written to the listing itself.
    const revision = await db.c.listing_revisions.findOne({ listingId: l.id });
    expect(revision?.bookId).toBeNull();

    const again = await ask(l.id, [l.photo], m1).expect(200);
    expect(again.body).toMatchObject({ status: 'Suggested', cached: true });
    expect(again.body.id).not.toBe(first.body.id);
    expect(fake.calls).toHaveLength(1);
    const usage = await db.c.price_assist_usage.findOne({
      _id: `autofill:user:${m1.id}:${new Date().toISOString().slice(0, 10)}`,
    });
    expect(usage?.calls).toBe(1);
  });

  it('replays by key, rejects the same key with another body, and answers missing data', async () => {
    const l = await listing();
    const second = await photo(l.id);
    const key = randomUUID();
    fake.output = { title: null, authors: [], isbn: '9780306406158', missing: [] };
    const none = await ask(l.id, [l.photo], m1, key).expect(200);
    validates('AutofillSuggestion', none.body);
    expect(none.body).toMatchObject({ status: 'NeedsMoreData', matches: [] });
    expect(none.body.fields.isbn).toBeNull();
    expect(none.body.missing[0]).toMatch(/tên sách/);
    const replay = await ask(l.id, [l.photo], m1, key).expect(200);
    expect(replay.body).toMatchObject({ id: none.body.id, cached: true });
    const conflict = await ask(l.id, [l.photo, second], m1, key).expect(409);
    expect(conflict.body.code).toBe('IdempotencyConflict');
    expect(fake.calls).toHaveLength(1);
  });

  it('stores a failure for its key, keeps quota spent and lets a new key retry', async () => {
    const l = await listing();
    const key = randomUUID();
    fake.mode = 'timeout';
    await ask(l.id, [l.photo], m1, key).expect(503);
    await ask(l.id, [l.photo], m1, key).expect(503);
    expect(fake.calls).toHaveLength(1);
    const failed = await db.c.autofill_suggestions.findOne({ ownerId: m1.id, requestKey: key });
    expect(failed).toMatchObject({ status: 'Failed', failure: 'Timeout', response: null });
    fake.mode = 'ok';
    await ask(l.id, [l.photo], m1).expect(200);
  });

  it('calls the fallback model once when the first reads no title', async () => {
    const l = await listing();
    fake.fallback = 'fake/fallback';
    fake.output = { title: null, authors: [] };
    fake.fallbackOutput = { title: bookTitle, authors: ['Nguyễn Nhật Ánh'] };
    const res = await ask(l.id, [l.photo], m1).expect(200);
    expect(res.body).toMatchObject({ status: 'Suggested', model: 'fake/fallback' });
    expect(res.body.matches[0]).toMatchObject({ book: { id: bookId }, matchedBy: 'TitleAuthor' });
    expect(fake.calls.map((c) => c.fallback)).toEqual([false, true]);
  });

  it('matches the catalog despite a misread accent, capitals and different name spacing', async () => {
    const l = await listing();
    // Live reads gave "Đề Mèn" for "Dế Mèn", all-caps titles and "新海 誠" for "新海誠".
    fake.output = {
      title: bookTitle.toUpperCase().replace('BIẾC', 'BIỆC'),
      authors: ['NGUYỄN NHẬTÁNH'],
      isbn: null,
    };
    const res = await ask(l.id, [l.photo], m1).expect(200);
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0]).toMatchObject({ book: { id: bookId }, matchedBy: 'TitleAuthor' });
    fake.output = { title: bookTitle, authors: ['Nguyễn Văn Khác'], isbn: null };
    const other = await ask(l.id, [await photo(l.id)], m1).expect(200);
    expect(other.body.matches).toEqual([]);
  });

  it('limits calls per listing per minute and allows one request in flight per member', async () => {
    const l = await listing();
    for (let i = 0; i < 3; i++) {
      // A new photo each time so the cache does not answer.
      const p = await photo(l.id);
      await ask(l.id, [p], m1).expect(200);
    }
    await ask(l.id, [await photo(l.id)], m1).expect(429);

    const a = await listing();
    const b = await listing();
    fake.mode = 'slow';
    const results = await Promise.all([
      ask(a.id, [a.photo], m1),
      ask(b.id, [b.photo], m1),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
  });

  it('refuses once the shared daily AI budget is spent', async () => {
    const l = await listing();
    await db.c.price_assist_usage.insertOne({
      _id: `global:${new Date().toISOString().slice(0, 10)}`,
      calls: 1,
      costMicroUsd: 1e9,
      expiresAt: new Date(Date.now() + 2 * 86_400_000),
    });
    await ask(l.id, [l.photo], m1).expect(503);
    expect(fake.calls).toHaveLength(0);
  });
});
