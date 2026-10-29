import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { validates } from './helpers/contract.js';
import { AutofillModel } from '../src/modules/autofill-assist/autofill-model.js';
import { recoveryKeys } from '../src/common/catalog-recovery-keys.js';
import { titleKey } from '../src/database/mongo/migrations/0003-catalog-title-key.js';
import { catalogRecoveryMigration } from '../src/database/mongo/migrations/0042-catalog-recovery-index.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';

const metadata = (
  title = 'Chiến binh cầu vồng',
  authors = ['Andrea Hirata'],
  isbn: string | null = null,
) => ({
  title,
  authors,
  publisher: 'NXB Trẻ',
  publicationYear: 2020,
  language: 'vi',
  edition: null,
  category: 'Văn học',
  isbn,
});
const hints = (title: string | null, authors: string[] = []) => ({
  title,
  authors,
  isbn: null as string | null,
  publisher: null,
  publicationYear: null,
  language: null,
  edition: null as string | null,
});
describe('listing catalog recovery: real HTTP/Mongo, no provider', () => {
  let app: INestApplication, db: MongoFixtures;
  type Reader = { id: string; token: string };
  let seller: Reader,
    other: Reader,
    admin: Reader,
    staff: Reader,
    restricted: Reader;
  let listingId: string, confirmedId: string, ownId: string, hiddenId: string;
  const users: string[] = [],
    books: string[] = [];
  const provider = {
    model: 'fake/unused',
    fallback: null,
    read: vi.fn(() => {
      throw new Error('Recovery must never call AI');
    }),
  };
  const post = (path: string, body: object, actor?: Reader) => {
    const call = request(app.getHttpServer()).post('/api/v1' + path);
    if (actor) call.set('Authorization', `Bearer ${actor.token}`);
    return call.send(body);
  };
  const command = (path: string, body: object, actor: Reader) =>
    post(path, body, actor).set('Idempotency-Key', randomUUID());
  const find = (
    body: ReturnType<typeof hints>,
    actor = seller,
    id = listingId,
  ) => post(`/listings/${id}/catalog-matches`, body, actor);
  async function user(
    roles: RoleCode[] = ['MEMBER'],
    status: UserStatus = 'ACTIVE',
  ) {
    const u = await db.user({
      email: `${randomUUID()}@catalog-recovery.test`,
      passwordHash: 'qa-unused-hash',
      displayName: 'QA Member',
      roles,
      status,
    });
    users.push(u._id);
    const sid = await db.session(u._id);
    return {
      id: u._id,
      token: await app.get(JwtService).signAsync({ sub: u._id, sid }),
    };
  }
  async function create(
    title: string,
    owner: Reader,
    confirm = false,
    authors = ['Andrea Hirata'],
  ) {
    const r = await command(
      '/catalog/requests',
      { metadata: metadata(title, authors) },
      owner,
    ).expect(200);
    books.push(r.body.entityId);
    if (confirm)
      await command(
        `/operations/catalog-requests/${r.body.entityId}/decision`,
        {
          expectedVersion: r.body.version,
          revisionId: r.body.revisionId,
          decision: 'Confirm',
        },
        admin,
      ).expect(200);
    return r.body.entityId as string;
  }
  beforeAll(async () => {
    db = await MongoFixtures.connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AutofillModel)
      .useValue(provider)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    seller = await user();
    other = await user();
    admin = await user(['MEMBER', 'ADMIN']);
    staff = await user(['STAFF']);
    restricted = await user(['MEMBER'], 'RESTRICTED');
    confirmedId = await create('Chiến binh cầu vồng', other, true);
    ownId = await create('Chiến binh cầu vồng', seller);
    hiddenId = await create('Chiến binh cầu vồng', other);
    const result = await command(
      '/listings',
      {
        content: {
          bookId: null,
          mode: null,
          condition: null,
          pages: '',
          coverNote: '',
          notes: '',
          accessories: '',
          description: '',
          readable: null,
          hasMissingPages: null,
          missingEssentialContent: null,
          salePrice: null,
          exchangeValue: null,
          mediaIds: [],
        },
      },
      seller,
    ).expect(200);
    listingId = result.body.entityId;
  }, 60000);
  afterAll(async () => {
    await app?.close();
    if (!db) return;
    try {
      const revisions = (
        await db.c.catalog_revisions.find({ bookId: { $in: books } }).toArray()
      ).map((row) => row._id);
      const audits = (
        await db.c.audit_events.find({ actorId: { $in: users } }).toArray()
      ).map((row) => row._id);
      await db.c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await db.c.audit_events.deleteMany({ _id: { $in: audits } });
      await db.c.mutation_receipts.deleteMany({ actorId: { $in: users } });
      await db.c.catalog_decisions.deleteMany({
        revisionId: { $in: revisions },
      });
      await db.c.catalog_revisions.deleteMany({ bookId: { $in: books } });
      await db.c.catalog_books.deleteMany({ _id: { $in: books } });
      const listings = listingId ? [listingId] : [];
      await db.c.listing_revisions.deleteMany({ listingId: { $in: listings } });
      await db.c.listings.deleteMany({ _id: { $in: listings } });
      await db.removeUsers(users);
    } finally {
      await db.close();
    }
  });
  it('returns ranked fuzzy candidates but never another member Pending request', async () => {
    const r = await find(
      hints('Chiếc bình cầu vồng', ['Andrea Hirata']),
    ).expect(200);
    validates('ListingCatalogMatches', r.body);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(
      r.body.items.map((x: { book: { id: string } }) => x.book.id),
    ).toEqual(expect.arrayContaining([confirmedId, ownId]));
    expect(
      r.body.items.map((x: { book: { id: string } }) => x.book.id),
    ).not.toContain(hiddenId);
    expect(
      r.body.items.every(
        (x: { matchedBy: string }) => x.matchedBy === 'SimilarTitle',
      ),
    ).toBe(true);
  });
  it('requires current owner, role, active account and session before reading candidates', async () => {
    await find(hints('Chiến binh cầu vồng'), other).expect(404);
    await find(hints('Chiến binh cầu vồng'), staff).expect(403);
    await find(hints('Chiến binh cầu vồng'), restricted).expect(403);
    await post(
      `/listings/${listingId}/catalog-matches`,
      hints('Chiến binh cầu vồng'),
    ).expect(401);
    const revoked = await user();
    await db.c.auth_sessions.updateMany(
      { userId: revoked.id },
      { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
    await find(hints('Chiến binh cầu vồng'), revoked).expect(401);
  });
  it('does not mutate listing/catalog or add receipts, quota or provider calls on repeat search', async () => {
    const listing = await db.c.listings.findOne({ _id: listingId });
    const catalogBefore = await db.c.catalog_books
      .find({ _id: { $in: [confirmedId, ownId, hiddenId] } })
      .sort({ _id: 1 })
      .toArray();
    const before = {
      receipts: await db.c.mutation_receipts.countDocuments({}),
      usage: await db.c.price_assist_usage.countDocuments({}),
      suggestions: await db.c.autofill_suggestions.countDocuments({}),
    };
    await find(hints('Chiến binh cầu vồng')).expect(200);
    await find(hints('Chiến binh cầu vồng')).expect(200);
    expect(await db.c.listings.findOne({ _id: listingId })).toEqual(listing);
    expect(
      await db.c.catalog_books
        .find({ _id: { $in: [confirmedId, ownId, hiddenId] } })
        .sort({ _id: 1 })
        .toArray(),
    ).toEqual(catalogBefore);
    expect(await db.c.mutation_receipts.countDocuments({})).toBe(
      before.receipts,
    );
    expect(await db.c.price_assist_usage.countDocuments({})).toBe(before.usage);
    expect(await db.c.autofill_suggestions.countDocuments({})).toBe(
      before.suggestions,
    );
    expect(provider.read).not.toHaveBeenCalled();
  });
  it('refuses a draft after its current editable state has changed', async () => {
    const before = await db.c.listings.findOne({ _id: listingId });
    try {
      await db.c.listings.updateOne(
        { _id: listingId },
        { $set: { moderation: 'PendingReview' }, $inc: { lockSeq: 1 } },
      );
      await find(hints('Chiến binh cầu vồng')).expect(409);
      await db.c.listings.updateOne(
        { _id: listingId },
        {
          $set: { moderation: 'Draft', trade: 'Reserved' },
          $inc: { lockSeq: 1 },
        },
      );
      await find(hints('Chiến binh cầu vồng')).expect(409);
      await db.c.listings.updateOne(
        { _id: listingId },
        {
          $set: { trade: 'Available', deletedAt: new Date() },
          $inc: { lockSeq: 1 },
        },
      );
      await find(hints('Chiến binh cầu vồng')).expect(404);
    } finally {
      await db.c.listings.updateOne(
        { _id: listingId },
        {
          $set: {
            moderation: before!.moderation,
            trade: before!.trade,
            deletedAt: before!.deletedAt,
            lockSeq: before!.lockSeq,
          },
        },
      );
    }
  });
  it('validates hints and excludes explicit ISBN conflicts', async () => {
    await find(hints(null)).expect(422);
    await find({
      ...hints('Chiến binh cầu vồng'),
      isbn: '9780000000000',
    }).expect(422);
    const result = await find({
      ...hints('Chiến binh cầu vồng'),
      isbn: '9786041234567',
    }).expect(200);
    expect(result.body.items).toEqual([]);
    await post(
      `/listings/${listingId}/catalog-matches`,
      { ...hints('A'), extra: true },
      seller,
    ).expect(422);
    await find({ ...hints('Doraemon - Tập 1'), edition: 'Tập 2' }).expect(422);
  });
  it('excludes explicit conflicting volumes, and recovers swapped roles', async () => {
    const first = await create('Doraemon - Tập 1', other, true, [
      'Fujiko F. Fujio',
    ]);
    const second = await create('Doraemon - Tập 2', other, true, [
      'Fujiko F. Fujio',
    ]);
    const r = await find(hints('Doraemon - Tập 1', ['Fujiko F. Fujio'])).expect(
      200,
    );
    expect(
      r.body.items.map((x: { book: { id: string } }) => x.book.id),
    ).toContain(first);
    expect(
      r.body.items.map((x: { book: { id: string } }) => x.book.id),
    ).not.toContain(second);
    const eye = await create('Mắt biếc', other, true, ['Nguyễn Nhật Ánh']);
    const s = await find(hints('nguyên nhất ánh', ['mát biếc'])).expect(200);
    expect(
      s.body.items.find((x: { book: { id: string } }) => x.book.id === eye)
        .matchedBy,
    ).toBe('SwappedText');
  });
  it('new migration backfills old projections without changing business versions and is repeat-safe', async () => {
    const b = await db.c.catalog_books.findOne({ _id: confirmedId });
    await db.c.catalog_books.updateOne(
      { _id: confirmedId },
      { $unset: { recoveryKeys: '' } },
    );
    await catalogRecoveryMigration.up(db.client.db());
    const after = await db.c.catalog_books.findOne({ _id: confirmedId });
    expect(after?.version).toBe(b!.version);
    expect(after?.recoveryKeys).toEqual(
      recoveryKeys('Chiến binh cầu vồng', ['Andrea Hirata']),
    );
    await catalogRecoveryMigration.up(db.client.db());
    expect(await db.c.catalog_books.findOne({ _id: confirmedId })).toEqual(
      after,
    );
    const explain = await db.client
      .db()
      .collection('catalog_books')
      .find({ status: 'Confirmed', recoveryKeys: { $in: ['chi'] } })
      .hint('catalog_books_status_recovery_keys_id_idx')
      .explain('executionStats');
    expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain(
      'IXSCAN',
    );
  });
  it('reports a bounded search window even when no ranked title survives', async () => {
    const template = (await db.c.catalog_books.findOne({ _id: confirmedId }))!;
    const revision = (await db.c.catalog_revisions.findOne({
      _id: template.currentRevisionId!,
    }))!;
    const rows = Array.from({ length: 122 }, (_, i) => {
      const id = randomUUID(),
        revisionId = randomUUID(),
        title = `Overflow catalogue ${i}`;
      return {
        book: {
          ...template,
          _id: id,
          currentRevisionId: revisionId,
          titleKey: titleKey(title),
          searchText: title.toLowerCase(),
          recoveryKeys: recoveryKeys(title, revision.authors),
        },
        revision: { ...revision, _id: revisionId, bookId: id, title },
      };
    });
    books.push(...rows.map((r) => r.book._id));
    await db.c.catalog_books.insertMany(rows.map((r) => r.book));
    await db.c.catalog_revisions.insertMany(rows.map((r) => r.revision));
    const r = await find(hints('Overflow incompatible target')).expect(200);
    expect(r.body).toMatchObject({ items: [], truncated: true });
  });
});
