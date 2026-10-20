import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type {
  RoleCode,
  UserStatus,
  ListingDoc,
} from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { onTransactionRetry } from '../src/database/mongo/transaction.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { SignedReadCache } from '../src/modules/media/signed-read-cache.js';
import { MongoCommandService } from '../src/modules/commands/mongo-command.service.js';
import { MongoPageService } from '../src/modules/commands/mongo-page.service.js';
import { checkListing } from '../src/modules/listings/listing-projection.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import {
  categories,
  facetsFor,
} from '@used-books/api-contract/catalog-taxonomy';

// Storage signing is deliberately faked. HTTP, authorization and MongoDB are real.
const signBatch = vi.fn(
  async (keys: string[]) =>
    new Map(
      keys.map((key) => [
        key,
        {
          url: 'https://storage.test/' + key,
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        },
      ]),
    ),
);
const signedCache = new SignedReadCache(
  signBatch,
  () => new Error('Synthetic storage unavailable'),
);
const storage = {
  beforeSign: undefined as (() => Promise<void>) | undefined,
  async check() {},
  async signedRead(key: string) {
    const result = await signedCache.read(key);
    await this.beforeSign?.();
    return result;
  },
  onModuleDestroy() {
    signedCache.close();
  },
};

type Reader = { id: string; token: string; sessionId: string; email: string };
const metadata = (
  title = 'Đường sách chuyền tay',
): import('../src/modules/commands/domain-error.js').Wire['CatalogMetadata'] => ({
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

describe('listing submission and moderation through HTTP with MongoDB', () => {
  let app: INestApplication, db: MongoFixtures;
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
  // Direct user writes bump lockSeq like every application writer of users.
  const setUser = (id: string, set: Record<string, unknown>) =>
    db.c.users.updateOne(
      { _id: id },
      { $set: { ...set, updatedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
  const dropRoles = (id: string) =>
    db.c.users.updateOne(
      { _id: id },
      { $set: { roles: [] }, $inc: { lockSeq: 1 } },
    );
  // A raw listing state change, like the former `db.listing.update` fixture.
  const changeListing = (id: string, set: Partial<ListingDoc>) =>
    db.c.listings.findOneAndUpdate(
      { _id: id },
      { $set: set, $inc: { version: 1, lockSeq: 1 } },
      { returnDocument: 'after' },
    );
  // Observes command transactions retrying against a held write lock (the
  // MongoDB analogue of a session queued behind a PostgreSQL row lock).
  function watchRetries() {
    const seen = new Set<number>();
    const stop = onTransactionRetry((event) => seen.add(event.transactionId));
    return {
      stop,
      async until(n = 1) {
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
          if (seen.size >= n) return;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new Error('Commands did not reach the lock barrier');
      },
    };
  }
  // Test-only pause of the first `operation` command after its mutation, inside
  // its transaction and while it holds every lock it took (replaces the former
  // advisory-lock trigger on audit/outbox insertion). No production failpoint.
  function pauseCommand(operation: string) {
    const commands = app.get(MongoCommandService);
    const original = commands.run.bind(commands);
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let paused = false;
    const spy = vi.spyOn(commands, 'run').mockImplementation(((
      context: any,
      op: string,
      target: any,
      body: any,
      options: any,
    ) =>
      original(
        context,
        op,
        target,
        body,
        op !== operation
          ? options
          : {
              ...options,
              mutate: async (...args: any[]) => {
                const change = await options.mutate(...args);
                if (!paused) {
                  paused = true;
                  entered();
                  await released;
                }
                return change;
              },
            },
      )) as any);
    return {
      reached,
      release: () => release(),
      restore: () => {
        release();
        spy.mockRestore();
      },
    };
  }
  const block = (actor: { id: string }) => Gate.lockUser(db.client, actor.id);

  it('exposes versioned taxonomy and rejects incompatible classification before a write', async () => {
    const taxonomy = await get('/catalog/taxonomy').expect(200);
    expect(taxonomy.body.version).toBe('catalog-v2');
    expect(
      taxonomy.body.categories.filter((c: any) => !c.parentId),
    ).toHaveLength(17);
    expect(taxonomy.body.categories).toHaveLength(72);
    expect(taxonomy.body.facets).toHaveLength(25);
    const before = await db.c.catalog_books.countDocuments({
      requesterId: m1.id,
    });
    for (const attributes of [
      { skill: ['grammar'] },
      { genre: ['action', 'action'] },
      { genre: ['unknown'] },
    ])
      await post(
        '/catalog/requests',
        {
          metadata: {
            ...metadata(),
            category: 'Manga / Comic',
            categoryId: 'manga',
            attributes,
          },
        },
        m1,
      ).expect(422);
    expect(
      await db.c.catalog_books.countDocuments({ requesterId: m1.id }),
    ).toBe(before);
    await get('/listings')
      .query({
        categoryId: 'education',
        facets: JSON.stringify({ schoolStage: ['primary'], grade: ['10'] }),
      })
      .expect(422);
    await get('/listings')
      .query({
        categoryId: 'languages.ja',
        facets: JSON.stringify({ purpose: ['exam'], level: ['ielts'] }),
      })
      .expect(422);
    await get('/listings')
      .query({ categoryId: 'manga', facets: 'null' })
      .expect(422);
  });
  it('publishes every v2 root and filters the complete reviewed shelf before pagination', async () => {
    const prefix = `Taxonomy V2 ${randomUUID()}`,
      ids = new Set<string>();
    for (const root of categories) {
      const owner = await reader();
      for (let index = 0; index < 2; index++) {
        const category =
          root.children[index === 0 ? 0 : root.children.length - 1] ?? root;
        const attributes = Object.fromEntries(
          facetsFor(category.id)
            .filter((f) => f.options.length)
            .map((f) => [f.id, [f.options[0]!.id]]),
        );
        const meta = {
          ...metadata(`${prefix} ${root.id} ${index}`),
          category: category.label,
          categoryId: category.id as NonNullable<
            ReturnType<typeof metadata>['categoryId']
          >,
          attributes,
        };
        const l = await complete(owner, true, 'Ready', meta);
        const submitted = await submit(l, owner).expect(200);
        await decide(submitted.body).expect(200);
        ids.add(l.entityId);
        const detail = await get(`/listings/${l.entityId}`).expect(200);
        expect(detail.body.book).toMatchObject({
          categoryId: category.id,
          attributes,
        });
      }
      const parent = await get('/listings')
        .query({ q: prefix, categoryId: root.id, limit: 50 })
        .expect(200);
      expect(parent.body.items).toHaveLength(2);
    }
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await get('/listings')
        .query({ q: prefix, limit: 5, ...(cursor ? { cursor } : {}) })
        .expect(200);
      for (const row of page.body.items) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
      cursor = page.body.nextCursor || undefined;
    } while (cursor);
    expect(seen).toEqual(ids);
  }, 60000);
  it('persists reviewed classification, filters the full eligible shelf and binds cursors', async () => {
    const created: any[] = [];
    for (const [title, categoryId, category, attributes] of [
      [
        'Bộ lọc truyện A',
        'manga',
        'Manga / Comic',
        { genre: ['action', 'fantasy'], audience: ['shounen'] },
      ],
      [
        'Bộ lọc truyện B',
        'manga',
        'Manga / Comic',
        { genre: ['comedy'], audience: ['shounen'] },
      ],
      [
        'Bộ lọc truyện C',
        'light-novel',
        'Light Novel',
        { genre: ['fantasy'], setting: ['isekai'] },
      ],
      [
        'Bộ lọc ngoại ngữ',
        'languages.ja',
        'Tiếng Nhật',
        { purpose: ['exam'], level: ['n3'], skill: ['grammar'] },
      ],
    ] as const) {
      const l = await complete(m1, true, 'Ready', {
        ...metadata(title),
        categoryId,
        category,
        attributes: JSON.parse(JSON.stringify(attributes)),
        series: categoryId === 'manga' ? 'Bộ lọc chung' : null,
      });
      const submitted = await submit(l).expect(200);
      await decide(submitted.body).expect(200);
      created.push(l);
    }
    const filters = {
      q: 'Bộ lọc',
      categoryId: 'manga',
      facets: JSON.stringify({
        genre: ['action', 'comedy'],
        audience: ['shounen'],
      }),
      limit: 1,
    };
    const page = await get('/listings').query(filters).expect(200);
    validates('PublicListingPage', page.body);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toBeTruthy();
    const second = await get('/listings')
      .query({
        ...filters,
        cursor: page.body.nextCursor,
        facets: JSON.stringify({
          audience: ['shounen'],
          genre: ['comedy', 'action'],
        }),
      })
      .expect(200);
    expect(
      new Set([...page.body.items, ...second.body.items].map((l: any) => l.id)),
    ).toEqual(new Set(created.slice(0, 2).map((l) => l.entityId)));
    await get('/listings')
      .query({
        ...filters,
        cursor: page.body.nextCursor,
        facets: JSON.stringify({ genre: ['fantasy'] }),
      })
      .expect(400);
    const japaneseParent = await get('/listings')
      .query({
        categoryId: 'languages',
        language: 'vi',
        facets: JSON.stringify({ purpose: ['exam'], level: ['n3'] }),
      })
      .expect(200);
    expect(japaneseParent.body.items.map((l: any) => l.id)).toEqual([
      created[3].entityId,
    ]);
    const japanese = await get('/listings')
      .query({
        categoryId: 'languages.ja',
        language: 'vi',
        facets: JSON.stringify({ purpose: ['exam'], level: ['n3'] }),
      })
      .expect(200);
    expect(japanese.body.items.map((l: any) => l.id)).toEqual([
      created[3].entityId,
    ]);
    expect(japanese.body.items[0].book.attributes.level).toEqual(['n3']);
    expect(
      (
        await get('/listings')
          .query({ categoryId: 'languages.ja', language: 'ja' })
          .expect(200)
      ).body.items,
    ).toEqual([]);
    const books = await get('/catalog/books')
      .query({ categoryId: 'languages', limit: 50 })
      .expect(200);
    expect(
      books.body.items.some((b: any) => b.id === created[3].book.entityId),
    ).toBe(true);
    const own = await get(
      '/operations/catalog-requests/' + created[0].book.entityId,
      a1,
    ).expect(200);
    expect(own.body.currentRevision.metadata.attributes.genre).toEqual([
      'action',
      'fantasy',
    ]);
    await changeListing(created[0].entityId, { visibility: 'Hidden' });
    const visible = await get('/listings')
      .query({ ...filters, limit: 50 })
      .expect(200);
    expect(visible.body.items.map((l: any) => l.id)).toEqual([
      created[1].entityId,
    ]);
  }, 45000);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
  }, 60000);
  // Keep each test below the owner publication cap without coupling it to the
  // listings or account mutations left by an earlier test.
  beforeEach(async () => {
    m1 = await reader();
    m2 = await reader();
    a1 = await reader(['MEMBER', 'ADMIN']);
    a2 = await reader(['ADMIN']);
    staff = await reader(['STAFF']);
    tester = await reader(['TEST_OPERATOR']);
    restricted = await reader(['MEMBER'], 'RESTRICTED');
  });
  afterAll(async () => {
    if (db) {
      const c = db.c;
      const listings = (
        await c.listings.find({ ownerId: { $in: users } }).toArray()
      ).map((l) => l._id);
      const revisions = (
        await c.listing_revisions
          .find({ listingId: { $in: listings } })
          .toArray()
      ).map((r) => r._id);
      const media = (
        await c.listing_media.find({ listingId: { $in: listings } }).toArray()
      ).map((m) => m._id);
      const books = (
        await c.catalog_books.find({ requesterId: { $in: users } }).toArray()
      ).map((b) => b._id);
      const bookRevisions = (
        await c.catalog_revisions.find({ bookId: { $in: books } }).toArray()
      ).map((r) => r._id);
      const audits = (
        await c.audit_events.find({ actorId: { $in: users } }).toArray()
      ).map((a) => a._id);
      await c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await c.audit_events.deleteMany({ _id: { $in: audits } });
      await c.mutation_receipts.deleteMany({ actorId: { $in: users } });
      await c.listing_decisions.deleteMany({ revisionId: { $in: revisions } });
      await c.revision_media.deleteMany({ listingId: { $in: listings } });
      await c.media_processing_jobs.deleteMany({ mediaId: { $in: media } });
      await c.listing_media.deleteMany({ _id: { $in: media } });
      await c.listing_revisions.deleteMany({ _id: { $in: revisions } });
      await c.listings.deleteMany({ _id: { $in: listings } });
      await c.catalog_decisions.deleteMany({
        revisionId: { $in: bookRevisions },
      });
      await c.catalog_revisions.deleteMany({ _id: { $in: bookRevisions } });
      await c.catalog_books.deleteMany({ _id: { $in: books } });
      await c.member_addresses.deleteMany({ ownerId: { $in: users } });
      await c.address_identities.deleteMany({ ownerId: { $in: users } });
      await c.address_books.deleteMany({ _id: { $in: users } });
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
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
    const key = randomUUID(),
      now = new Date();
    // Fixture derivative only: not proof of upload/Sharp/live-provider behavior.
    const doc = {
      _id: randomUUID(),
      listingId,
      version: 1,
      status,
      stagingKey: key,
      pinnedKey: status === 'Ready' ? key + '/input' : null,
      derivativeKey: status === 'Ready' ? key + '/display.webp' : null,
      mimeType: 'image/jpeg',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      width: status === 'Ready' ? 20 : null,
      height: status === 'Ready' ? 20 : null,
      failureCode: null,
      expiresAt: new Date(Date.now() + 3600000),
      purgedAt: null,
      reservedBytes: 1000,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    };
    await db.c.listing_media.insertOne(doc);
    return { ...doc, id: doc._id };
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
  const revisionIds = async (listingId: string) =>
    (await db.c.listing_revisions.find({ listingId }).toArray()).map(
      (r) => r._id,
    );
  const decisionCount = async (listingId: string) =>
    db.c.listing_decisions.countDocuments({
      revisionId: { $in: await revisionIds(listingId) },
    });
  // Outbox events carry no listing id; they join through their audit event.
  async function outbox(listingId: string, actions?: string[]) {
    const audits = await db.c.audit_events
      .find({ listingId, ...(actions ? { action: { $in: actions } } : {}) })
      .toArray();
    return db.c.outbox_events
      .find({ auditId: { $in: audits.map((a) => a._id) } })
      .toArray();
  }
  async function effectCounts(id: string) {
    return {
      decisions: await decisionCount(id),
      receipts: await db.c.mutation_receipts.countDocuments({
        listingId: id,
        operation: 'decideListing',
      }),
      audits: await db.c.audit_events.countDocuments({
        listingId: id,
        action: 'decideListing',
      }),
      events: (await outbox(id, ['decideListing'])).length,
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
    const listing = await db.c.listings.findOne({ _id: l.entityId });
    expect(listing!.publishedAt).not.toBeNull();
    expect((await outbox(l.entityId)).map((e) => e.type).sort()).toEqual([
      'ListingApproved',
      'ListingSubmitted',
    ]);
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
    const r = await db.c.listing_revisions.findOne({ _id: l.revisionId });
    expect(r!.submittedAt).toBeNull();
    expect(
      await db.c.audit_events.countDocuments({
        listingId: l.entityId,
        action: 'submitListing',
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
      await db.c.audit_events.countDocuments({
        mediaId: l.image.id,
        actorId: staff.id,
        action: 'getReviewMediaRead',
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
    const owner = await reader();
    const restrictedOwner = await complete(owner);
    const stored = await db.c.listings.findOne({
      _id: restrictedOwner.entityId,
    });
    expect(stored!.ownerId).toBe(owner.id);
    await setUser(owner.id, { status: 'RESTRICTED' });
    await submit(restrictedOwner, owner).expect(403);
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
      await dropRoles(actor.id);
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
    const gate = await block(m1);
    let first: Promise<request.Response> | undefined,
      second: Promise<request.Response> | undefined;
    try {
      first = decide(l, 'Approve', staff).then((r) => r);
      second = decide(l, 'Reject', a2).then((r) => r);
      await gate.contended(2);
      await gate.commit();
      const results = await Promise.all([first, second]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    } finally {
      await gate.close();
      await Promise.allSettled([first, second]);
    }
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
      const gate = await block(owner);
      const response = decide(l).then((r) => r);
      try {
        await gate.contended();
        const users = gate.db.collection<{ _id: string }>('users');
        const inGate = { session: gate.session };
        if (change === 'restrict')
          await users.updateOne(
            { _id: owner.id },
            { $set: { status: 'RESTRICTED' } },
            inGate,
          );
        if (change === 'role')
          await users.updateOne(
            { _id: owner.id },
            { $pull: { roles: { role: 'MEMBER' } } } as never,
            inGate,
          );
        if (change === 'verified')
          await users.updateOne(
            { _id: owner.id },
            { $set: { emailVerifiedAt: null } },
            inGate,
          );
        await gate.commit();
        expect((await response).status).toBe(403);
      } finally {
        await gate.close();
        await response;
      }
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
    const gate = await block(owner);
    const response = submit(l, owner).then((r) => r);
    try {
      await gate.contended();
      await gate.db
        .collection<{ _id: string }>('users')
        .updateOne(
          { _id: owner.id },
          { $set: { status: 'RESTRICTED' } },
          { session: gate.session },
        );
      await gate.commit();
      expect((await response).status).toBe(403);
    } finally {
      await gate.close();
      await response;
    }
    expect(
      (await db.c.listing_revisions.findOne({ _id: l.revisionId }))!
        .submittedAt,
    ).toBeNull();
  });
  it('deduplicates simultaneous same-key submission and rejects altered replay or a revoked session', async () => {
    const owner = await reader();
    const l = await complete(owner);
    const key = randomUUID();
    const gate = await block(owner);
    let first: Promise<request.Response> | undefined,
      second: Promise<request.Response> | undefined;
    try {
      first = submit(l, owner, key).then((r) => r);
      second = submit(l, owner, key).then((r) => r);
      await gate.contended(2);
      await gate.commit();
      const results = await Promise.all([first, second]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results[0].body).toEqual(results[1].body);
    } finally {
      await gate.close();
      await Promise.allSettled([first, second]);
    }
    expect(await outbox(l.entityId, ['submitListing'])).toHaveLength(1);
    await submit({ ...l, version: l.version + 1 }, owner, key).expect(409);
    await db.c.auth_sessions.updateOne(
      { _id: owner.sessionId },
      { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
    await submit(l, owner, key).expect(401);
  });
  it.each(['role', 'session', 'restricted'] as const)(
    'rechecks reviewer authorization after waiting: %s',
    async (change) => {
      const actor = await reader(['STAFF']);
      const l = await pending();
      const gate = await block(actor);
      const response = decide(l, 'Approve', actor).then((r) => r);
      try {
        await gate.contended();
        const inGate = { session: gate.session };
        if (change === 'role')
          await gate.db
            .collection<{ _id: string }>('users')
            .updateOne({ _id: actor.id }, { $set: { roles: [] } }, inGate);
        if (change === 'session')
          await gate.db
            .collection<{ _id: string }>('auth_sessions')
            .updateOne(
              { _id: actor.sessionId },
              { $set: { revokedAt: new Date() } },
              inGate,
            );
        if (change === 'restricted')
          await gate.db
            .collection<{ _id: string }>('users')
            .updateOne(
              { _id: actor.id },
              { $set: { status: 'RESTRICTED' } },
              inGate,
            );
        await gate.commit();
        expect((await response).status).toBe(change === 'session' ? 401 : 403);
      } finally {
        await gate.close();
        await response;
      }
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
    // The approval pauses inside its transaction holding the owner lock; a
    // concurrent owner restriction must wait for (retry after) its commit.
    const pause = pauseCommand('decideListing');
    const retries = watchRetries();
    const approval = decide(l).then((r) => r);
    let restriction: Promise<unknown> | undefined;
    try {
      await pause.reached;
      restriction = app.get(MongoService).tx((tx) =>
        tx.c.users.updateOne(
          { _id: owner.id },
          {
            $set: { status: 'RESTRICTED', updatedAt: new Date() },
            $inc: { lockSeq: 1 },
          },
        ),
      );
      await retries.until(1);
      expect((await db.c.users.findOne({ _id: owner.id }))!.status).toBe(
        'ACTIVE',
      );
      pause.release();
      expect((await approval).status).toBe(200);
      await restriction;
      expect(await effectCounts(l.entityId)).toEqual({
        decisions: 1,
        receipts: 1,
        audits: 1,
        events: 1,
      });
      expect((await db.c.users.findOne({ _id: owner.id }))!.status).toBe(
        'RESTRICTED',
      );
    } finally {
      retries.stop();
      pause.restore();
      await Promise.allSettled([approval, restriction]);
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
      const changed = await changeListing(l.entityId, data);
      await decide({ ...l, version: changed!.version }).expect(
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
    await dropRoles(actor.id);
    await decide(l, 'Approve', actor, key).expect(403);
  });
  it('rolls back revision freeze, decision, receipt and audit when durable event insertion fails', async () => {
    // Test-only failpoint: a temporary validator rule (the former failing SQL
    // trigger) scoped to this listing. No runtime failpoint or HTTP endpoint.
    const l = await complete();
    const key = randomUUID();
    const rejectEvents = {
      type: { $in: ['ListingSubmitted', 'ListingApproved'] },
      'payload.entityId': l.entityId,
    };
    await db.withRejectingValidator('outbox_events', rejectEvents, async () => {
      await submit(l, m1, key).expect(500);
      expect(
        (await db.c.listing_revisions.findOne({ _id: l.revisionId }))!
          .submittedAt,
      ).toBeNull();
      expect(
        await db.c.mutation_receipts.countDocuments({
          listingId: l.entityId,
          operation: 'submitListing',
        }),
      ).toBe(0);
      expect(
        await db.c.audit_events.countDocuments({
          listingId: l.entityId,
          action: 'submitListing',
        }),
      ).toBe(0);
    });
    const submitted = await submit(l, m1, key).expect(200);
    await db.withRejectingValidator('outbox_events', rejectEvents, async () => {
      await decide(submitted.body).expect(500);
      expect(await effectCounts(l.entityId)).toEqual({
        decisions: 0,
        receipts: 0,
        audits: 0,
        events: 0,
      });
      expect(
        (await db.c.listings.findOne({ _id: l.entityId }))!.moderation,
      ).toBe('PendingReview');
    });
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
          audits: await db.c.audit_events.countDocuments({
            listingId: l.entityId,
          }),
          receipts: await db.c.mutation_receipts.countDocuments({
            listingId: l.entityId,
          }),
          revisions: await db.c.listing_revisions.countDocuments({
            listingId: l.entityId,
          }),
          decisions: await decisionCount(l.entityId),
        };
        // The winner pauses inside its transaction after its mutation, holding
        // its locks (the former advisory-lock trigger on audit insertion).
        const pause = pauseCommand(winner);
        const retries = watchRetries();
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
          await pause.reached;
          second = command(loser, 'Losing edit').then((r) => r);
          await retries.until(1);
          pause.release();
          expect((await first).status).toBe(200);
          expect([404, 409]).toContain((await second).status);
          const final = (await db.c.listings.findOne({ _id: l.entityId }))!;
          const current = (await db.c.listing_revisions.findOne({
            _id: final.currentRevisionId!,
          }))!;
          expect(final.version).toBe(l.version + 1);
          expect(
            await db.c.audit_events.countDocuments({ listingId: l.entityId }),
          ).toBe(before.audits + 1);
          expect(
            await db.c.mutation_receipts.countDocuments({
              listingId: l.entityId,
            }),
          ).toBe(before.receipts + 1);
          expect(
            await db.c.listing_revisions.countDocuments({
              listingId: l.entityId,
            }),
          ).toBe(
            before.revisions + (winner === 'reviseApprovedListing' ? 1 : 0),
          );
          expect(await decisionCount(l.entityId)).toBe(
            before.decisions + (winner === 'decideListing' ? 1 : 0),
          );
          expect(await outbox(l.entityId, actions)).toHaveLength(
            [
              'decideListing',
              'removeListing',
              'reviseApprovedListing',
            ].includes(winner)
              ? 1
              : 0,
          );
          if (winner === 'saveListingDraft')
            expect(current.notes).toBe('Winning edit');
          if (winner === 'archiveListing')
            expect(final.deletedAt).not.toBeNull();
          if (winner === 'removeListing')
            expect(final.visibility).toBe('Removed');
          if (winner === 'decideListing')
            expect(final.moderation).toBe('Approved');
          if (winner === 'reviseApprovedListing')
            expect(final.moderation).toBe('PendingReview');
        } finally {
          retries.stop();
          pause.restore();
          await Promise.allSettled([first, second]);
        }
      },
    );
    it('rolls back revision, archive, visibility and removal when their audit cannot commit', async () => {
      const l = await approved();
      const operations = [
        'reviseApprovedListing',
        'archiveListing',
        'setListingVisibility',
        'removeListing',
      ];
      await db.withRejectingValidator(
        'audit_events',
        { action: { $in: operations }, listingId: l.entityId },
        async () => {
          await revise(l).expect(500);
          await archive(l).expect(500);
          await visibility(l).expect(500);
          await remove(l).expect(500);
          const final = await db.c.listings.findOne({ _id: l.entityId });
          expect(final).toMatchObject({
            version: l.version,
            currentRevisionId: l.revisionId,
            visibility: 'Visible',
            moderation: 'Approved',
            deletedAt: null,
            removalReason: null,
          });
          expect(
            await db.c.listing_revisions.countDocuments({
              listingId: l.entityId,
            }),
          ).toBe(1);
          expect(
            await db.c.mutation_receipts.countDocuments({
              listingId: l.entityId,
              operation: { $in: operations },
            }),
          ).toBe(0);
        },
      );
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
        await db.c.outbox_events.countDocuments({
          type: 'ListingSubmitted',
          'payload.revisionId': r.body.revisionId,
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
      await setUser(owner.id, { status: 'RESTRICTED' });
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
        await db.c.listing_revisions.countDocuments({ listingId: l.entityId }),
      ).toBe(1);
      expect(
        await db.c.mutation_receipts.countDocuments({
          listingId: l.entityId,
          operation: 'archiveListing',
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
        await db.c.outbox_events.countDocuments({
          type: 'ListingRemoved',
          'payload.entityId': l.entityId,
        }),
      ).toBe(1);
    });
    it.each(['Sold', 'Exchanged', 'ClosedUnavailable'] as const)(
      'rejects lifecycle mutation for %s without touching trade',
      async (trade) => {
        const l = await approved();
        await changeListing(l.entityId, { trade });
        l.version++;
        await revise(l).expect(409);
        await visibility(l).expect(409);
        await archive(l).expect(409);
        await remove(l).expect(409);
        expect((await db.c.listings.findOne({ _id: l.entityId }))!.trade).toBe(
          trade,
        );
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
      const final = (await db.c.listings.findOne({ _id: l.entityId }))!;
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
        await db.c.audit_events.countDocuments({
          listingId: another.entityId,
          action: 'setListingVisibility',
        }),
      ).toBe(1);
    });
    it('rechecks role and active status after lock waits before revising and replaying', async () => {
      const owner = await reader(),
        l = await approved(owner);
      const gate = await block(owner);
      const response = revise(l, owner).then((r) => r);
      try {
        await gate.contended();
        await gate.db
          .collection<{ _id: string }>('users')
          .updateOne(
            { _id: owner.id },
            { $set: { status: 'RESTRICTED' } },
            { session: gate.session },
          );
        await gate.commit();
        expect((await response).status).toBe(403);
      } finally {
        await gate.close();
        await response;
      }
      const key = randomUUID();
      await archive(l, owner, key).expect(200);
      await db.removeRole(owner.id, 'MEMBER');
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
        await changeListing(l.entityId, data as Partial<ListingDoc>);
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
        await db.setStatus(owner.id, status);
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
      await setUser(owner.id, { emailVerifiedAt: null });
      await get(`/listings/${l.entityId}`).expect(404);
      await setUser(owner.id, { emailVerifiedAt: new Date() });
      await db.removeRole(owner.id, 'MEMBER');
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
      const service = app.get(MongoPageService),
        original = service.page.bind(service);
      const spy = vi
        .spyOn(service, 'page')
        .mockImplementationOnce(async (collection, pipeline, options) => {
          const selected = await original(collection, pipeline, options);
          await changeListing(l.entityId, { visibility: 'Hidden' });
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
    it('reuses the storage grant without reusing eligibility after a listing is hidden', async () => {
      const l = await published();
      const path = `/listings/${l.entityId}/media/${l.image.id}/read`;
      const first = await get(path).expect(200);
      const signedCount = signBatch.mock.calls.length;
      const second = await get(path).expect(200);
      expect(second.body).toEqual(first.body);
      expect(signBatch.mock.calls.length).toBe(signedCount);
      await changeListing(l.entityId, { visibility: 'Hidden' });
      await get(path).expect(404);
      expect(signBatch.mock.calls.length).toBe(signedCount);
    });
    it.each([false, true])(
      'does not return a signed URL when owner eligibility is revoked during signing (cached: %s)',
      async (cached) => {
        const owner = await reader(),
          l = await published(owner);
        if (cached)
          await get(`/listings/${l.entityId}/media/${l.image.id}/read`).expect(
            200,
          );
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
          await db.removeRole(owner.id, 'MEMBER');
          release();
          expect((await response).status).toBe(404);
        } finally {
          release();
          storage.beforeSign = undefined;
          await response;
        }
      },
    );
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
      expect(
        await db.c.mutation_receipts.countDocuments({ listingId: id }),
      ).toBe(3);
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
      const receipts = await db.c.mutation_receipts
          .find({ listingId: l.entityId })
          .toArray(),
        audits = await db.c.audit_events
          .find({ listingId: l.entityId })
          .toArray();
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
        const old = await db.c.listing_revisions.findOne({
          _id: sent.revisionId,
        });
        await changeAddress(owner, l.fulfillment, remove);
        const own = (await get(`/me/listings/${l.entityId}`, owner).expect(200))
          .body;
        expect(own.currentRevision.fulfillmentStatus).toBe('NeedsUpdate');
        expect(own.currentRevision.content.fulfillment).toEqual(l.fulfillment);
        expect(
          await db.c.listing_revisions.findOne({ _id: sent.revisionId }),
        ).toEqual(old);
        expect(
          (await get(`/listings/${l.entityId}`).expect(200)).body.fulfillment,
        ).toBeNull();
        if (remove) {
          expect(
            await db.c.member_addresses.findOne({
              _id: l.fulfillment.originAddressId,
            }),
          ).toBeNull();
          expect(
            await db.c.address_identities.findOne({
              _id: l.fulfillment.originAddressId,
            }),
          ).toEqual({ _id: l.fulfillment.originAddressId, ownerId: owner.id });
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
        await db.c.listing_revisions.countDocuments({ listingId: l.entityId }),
      ).toBe(2);
    });
    it('rechecks a changed origin after a real owner-lock barrier and rolls back the losing save', async () => {
      const owner = await reader(),
        l = await configured(owner),
        gate = await block(owner);
      const response = put(
        l.entityId,
        { expectedVersion: l.version, content: l.content },
        owner,
      ).then((r) => r);
      try {
        await gate.contended();
        // A contact edit under the owner lock; the address writer advances the
        // content version (formerly the latlai_address_content_version trigger).
        await gate.db
          .collection<{ _id: string }>('member_addresses')
          .updateOne(
            { _id: l.fulfillment.originAddressId },
            { $set: { detail: 'Địa chỉ mới tại gate' }, $inc: { version: 1 } },
            { session: gate.session },
          );
        await gate.commit();
        expect((await response).status).toBe(409);
        expect(
          (await db.c.listings.findOne({ _id: l.entityId }))!.version,
        ).toBe(l.version);
      } finally {
        await gate.close();
        await response;
      }
    });
    it('approval rechecks origin after deletion wins the lock; no decision/audit is created', async () => {
      const owner = await reader(),
        l = await configured(owner),
        sent = (await submit(l, owner).expect(200)).body,
        gate = await block(owner);
      const response = decide(sent).then((r) => r);
      try {
        await gate.contended();
        await gate.db
          .collection<{ _id: string }>('member_addresses')
          .deleteOne(
            { _id: l.fulfillment.originAddressId },
            { session: gate.session },
          );
        await gate.commit();
        expect((await response).status).toBe(404);
        expect(await effectCounts(l.entityId)).toEqual({
          decisions: 0,
          receipts: 0,
          audits: 0,
          events: 0,
        });
      } finally {
        await gate.close();
        await response;
      }
    });
    it('approval winning the real lock precedes deletion; history stays approved and public choice becomes unavailable', async () => {
      const owner = await reader(),
        l = await configured(owner),
        sent = (await submit(l, owner).expect(200)).body;
      // MongoDB retries instead of queueing, so "approval first" is made
      // explicit: the approval pauses holding the owner lock, the deletion
      // provably contends, then the approval commits first.
      const pause = pauseCommand('decideListing');
      const retries = watchRetries();
      const response = decide(sent).then((r) => r);
      let deletion: Promise<request.Response> | undefined;
      try {
        await pause.reached;
        const version = (await db.c.address_books.findOne({ _id: owner.id }))!
          .version;
        deletion = post(
          `/me/addresses/${l.fulfillment.originAddressId}/archive`,
          { expectedBookVersion: version },
          owner,
        ).then((r) => r);
        await retries.until(1);
        pause.release();
        expect((await response).status).toBe(200);
        expect((await deletion).status).toBe(200);
        expect(
          (await get(`/listings/${l.entityId}`).expect(200)).body.fulfillment,
        ).toBeNull();
      } finally {
        retries.stop();
        pause.restore();
        await Promise.allSettled([response, deletion]);
      }
    });
    it('database backstops forbid partial origins and reused/rewritten identities; cross-owner origins fail the commit-time check', async () => {
      const owner = await reader(),
        other = await reader(),
        l = await configured(owner),
        foreign = await origin(other);
      // Partial origin: listing_revisions validator (revision_fulfillment_complete).
      await expect(
        db.c.listing_revisions.updateOne(
          { _id: l.revisionId },
          { $set: { originAddressVersion: null } },
        ),
      ).rejects.toMatchObject({ code: 121 });
      // PostgreSQL's latlai_revision_origin_check rejected a foreign origin in
      // the database. MongoDB cannot (cross-document): a raw privileged write
      // succeeds and the listing commit-time check detects it (MIG02_MODEL_MAP).
      await db.c.listing_revisions.updateOne(
        { _id: l.revisionId },
        { $set: { originAddressId: foreign.originAddressId } },
      );
      const mongo = app.get(MongoService);
      await expect(
        mongo.tx((tx) => checkListing(tx, l.entityId)),
      ).rejects.toThrow('Origin is not an address of the listing owner');
      await db.c.listing_revisions.updateOne(
        { _id: l.revisionId },
        { $set: { originAddressId: l.fulfillment.originAddressId } },
      );
      await mongo.tx((tx) => checkListing(tx, l.entityId));
      const sent = (await submit(l, owner).expect(200)).body;
      expect(sent.revisionId).toBe(l.revisionId);
      await changeAddress(other, foreign, true);
      // A deleted identity is never reused: identities are unique and the
      // application user can neither rewrite nor delete them (append-only).
      await expect(
        db.c.address_identities.insertOne({
          _id: foreign.originAddressId,
          ownerId: other.id,
        }),
      ).rejects.toMatchObject({ code: 11000 });
      const appDb = app.get(MongoService).db;
      await expect(
        appDb
          .collection<{ _id: string }>('address_identities')
          .updateOne(
            { _id: foreign.originAddressId },
            { $set: { ownerId: owner.id } },
          ),
      ).rejects.toMatchObject({ code: 13 });
      await expect(
        appDb
          .collection<{ _id: string }>('address_identities')
          .deleteOne({ _id: foreign.originAddressId }),
      ).rejects.toMatchObject({ code: 13 });
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
      // Test-only failpoint: temporary validator rule scoped to this listing.
      await db.withRejectingValidator(
        'audit_events',
        { listingId: l.entityId },
        async () => {
          await put(l.entityId, body, owner, key).expect(500);
          expect(
            (await get(`/me/listings/${l.entityId}`, owner)).body
              .currentRevision.content.fulfillment,
          ).toEqual(l.fulfillment);
        },
      );
      const saved = await put(l.entityId, body, owner, key).expect(200);
      expect(saved.body.version).toBe(l.version + 1);
      expect(
        (await put(l.entityId, body, owner, key).expect(200)).body,
      ).toEqual(saved.body);
    });
    it('gives only active Admins a filtered, credential-free user directory', async () => {
      const pending = await reader(['MEMBER'], 'PENDING_VERIFICATION');
      const restrictedAdmin = await reader(['ADMIN'], 'RESTRICTED');
      const response = await get(
        `/operations/users?q=${encodeURIComponent(pending.email)}&status=PENDING_VERIFICATION&role=MEMBER`,
        a1,
      ).expect(200);
      validates('OperationsUserPage', response.body);
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.body.items).toEqual([
        expect.objectContaining({
          id: pending.id,
          email: pending.email,
          status: 'PENDING_VERIFICATION',
          roles: ['MEMBER'],
        }),
      ]);
      expect(response.body.items[0]).not.toHaveProperty('passwordHash');
      expect(response.body.items[0]).not.toHaveProperty('sessions');
      await get('/operations/users', staff).expect(403);
      await get('/operations/users', restrictedAdmin).expect(403);
      await get('/operations/users', m1).expect(403);
    });
  });
});
