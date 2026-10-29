import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { validates } from './helpers/contract.js';
import { isbnImage } from './helpers/isbn-image.js';
import { AutofillModel } from '../src/modules/autofill-assist/autofill-model.js';
import { PriceModel } from '../src/modules/price-assist/price-model.js';
import { IsbnBarcodeReader } from '../src/modules/autofill-assist/isbn-barcode-reader.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import type { RoleCode, UserStatus } from '../src/database/mongo/documents.js';

describe('listing fast paths HTTP/Mongo with real barcode decoder and fake storage', () => {
  let app: INestApplication,
    db: MongoFixtures,
    listingId: string,
    bookId: string,
    mediaId: string;
  type Reader = { id: string; token: string };
  let owner: Reader,
    other: Reader,
    staff: Reader,
    admin: Reader,
    restricted: Reader;
  const objects = new Map<string, Buffer>();
  const vision = {
    read: vi.fn(() => {
      throw new Error('Fast paths must not call a model');
    }),
    model: 'fake/unused',
    fallback: null,
  };
  const price = {
    draft: vi.fn(() => {
      throw new Error('Fast paths must not call a model');
    }),
    model: 'fake/unused',
  };
  let gate: Promise<void> | null = null,
    entered: (() => void) | null = null;
  const storage = {
    read: vi.fn(async (key: string) => {
      entered?.();
      if (gate) await gate;
      return objects.get(key)!;
    }),
  };
  const post = (path: string, body: object, actor = owner) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', `Bearer ${actor.token}`)
      .send(body);
  const command = (path: string, body: object, actor = owner) =>
    post(path, body, actor).set('Idempotency-Key', randomUUID());
  const priceInput = () => ({
    bookId,
    condition: 'Good',
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
  });
  const scan = (ids = [mediaId], actor = owner) =>
    post(`/listings/${listingId}/isbn-matches`, { mediaIds: ids }, actor);
  const reference = (body = priceInput(), actor = owner) =>
    post(`/listings/${listingId}/price-reference`, body, actor);
  async function user(
    roles: RoleCode[] = ['MEMBER'],
    status: UserStatus = 'ACTIVE',
  ) {
    const u = await db.user({
      email: `${randomUUID()}@fast-path.test`,
      roles,
      status,
    });
    return {
      id: u._id,
      token: await app
        .get(JwtService)
        .signAsync({ sub: u._id, sid: await db.session(u._id) }),
    };
  }
  async function photo(bytes: Buffer) {
    const id = randomUUID(),
      key = `qa/barcode/${id}`,
      now = new Date();
    objects.set(key, bytes);
    await db.c.listing_media.insertOne({
      _id: id,
      listingId,
      version: 1,
      status: 'Ready',
      stagingKey: key,
      pinnedKey: key,
      derivativeKey: key,
      mimeType: 'image/png',
      byteSize: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: 800,
      height: 600,
      failureCode: null,
      expiresAt: new Date(+now + 86400000),
      purgedAt: null,
      reservedBytes: 0,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    return id;
  }
  beforeAll(async () => {
    db = await MongoFixtures.connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AutofillModel)
      .useValue(vision)
      .overrideProvider(PriceModel)
      .useValue(price)
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    owner = await user();
    other = await user();
    staff = await user(['STAFF']);
    admin = await user(['MEMBER', 'ADMIN']);
    restricted = await user(['MEMBER'], 'RESTRICTED');
    const catalog = await command(
      '/catalog/requests',
      {
        metadata: {
          title: 'Sách QA ISBN',
          authors: ['QA Author'],
          publisher: 'QA Publisher',
          publicationYear: 2026,
          language: 'vi',
          edition: 'QA 1',
          category: 'Văn học',
          isbn: '9786041234567',
        },
      },
      other,
    ).expect(200);
    bookId = catalog.body.entityId;
    await command(
      `/operations/catalog-requests/${bookId}/decision`,
      {
        expectedVersion: catalog.body.version,
        revisionId: catalog.body.revisionId,
        decision: 'Confirm',
      },
      admin,
    ).expect(200);
    const listing = await command('/listings', {
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
    }).expect(200);
    listingId = listing.body.entityId;
    mediaId = await photo(await isbnImage());
    const now = new Date();
    await db.c.price_references.insertMany([
      {
        _id: randomUUID(),
        bookId,
        isbn: '9786041234567',
        kind: 'CoverPrice',
        amount: 100000,
        condition: null,
        sourceLabel: 'Publisher',
        sourceUrl: 'https://publisher.example/book',
        observedAt: now,
        enteredBy: 'QA',
        rightsNote: 'Synthetic fixture',
        retiredAt: null,
        createdAt: now,
      },
      {
        _id: randomUUID(),
        bookId,
        isbn: '9786041234567',
        kind: 'CompletedSale',
        amount: 50000,
        condition: 'Good',
        sourceLabel: 'Sale',
        sourceUrl: null,
        sourceGroup: 'qa-completed-sale',
        observedAt: now,
        enteredBy: 'QA',
        rightsNote: 'Synthetic fixture',
        retiredAt: null,
        createdAt: now,
      },
    ]);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    if (!db) return;
    try {
      // This suite shares the E2E database. Its confirmed ISBN must not remain
      // visible to later catalog searches after this suite has finished.
      const users = [owner, other, staff, admin, restricted].flatMap((u) =>
        u ? [u.id] : [],
      );
      const books = bookId ? [bookId] : [];
      const listings = (
        await db.c.listings.find({ ownerId: { $in: users } }).toArray()
      ).map((row) => row._id);
      const revisions = (
        await db.c.catalog_revisions.find({ bookId: { $in: books } }).toArray()
      ).map((row) => row._id);
      const audits = (
        await db.c.audit_events.find({ actorId: { $in: users } }).toArray()
      ).map((row) => row._id);
      await db.c.outbox_events.deleteMany({ auditId: { $in: audits } });
      await db.c.audit_events.deleteMany({ _id: { $in: audits } });
      await db.c.mutation_receipts.deleteMany({ actorId: { $in: users } });
      await db.c.price_references.deleteMany({ bookId: { $in: books } });
      await db.c.catalog_decisions.deleteMany({
        revisionId: { $in: revisions },
      });
      await db.c.catalog_revisions.deleteMany({ bookId: { $in: books } });
      await db.c.catalog_books.deleteMany({ _id: { $in: books } });
      await db.c.listing_media.deleteMany({ listingId: { $in: listings } });
      await db.c.listing_revisions.deleteMany({ listingId: { $in: listings } });
      await db.c.listings.deleteMany({ _id: { $in: listings } });
      await db.removeUsers(users);
    } finally {
      await db.close();
    }
  });
  it('returns a matching catalog from real EAN-13 without AI or quota, and does not mutate the draft', async () => {
    const before = await db.c.listings.findOne({ _id: listingId });
    const response = await scan().expect(200);
    validates('ListingIsbnMatches', response.body);
    expect(response.body).toMatchObject({
      status: 'Found',
      isbns: ['9786041234567'],
      catalog: {
        items: [
          expect.objectContaining({
            book: expect.objectContaining({ id: bookId }),
            matchedBy: 'Isbn',
          }),
        ],
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['server-timing']).toMatch(
      /^isbn_local;dur=[0-9.]+$/,
    );
    await scan().expect(200);
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(await db.c.listings.findOne({ _id: listingId })).toEqual(before);
    expect(await db.c.autofill_suggestions.countDocuments({ listingId })).toBe(
      0,
    );
    expect(await db.c.price_assist_usage.countDocuments({})).toBe(0);
    expect(vision.read).not.toHaveBeenCalled();
    expect(price.draft).not.toHaveBeenCalled();
  });
  it('shows a rule reference before any model, stable by input/sources, not an AI suggestion ID', async () => {
    const response = await reference().expect(200);
    validates('ListingPriceReference', response.body);
    expect(response.body).toMatchObject({
      status: 'Ready',
      range: { low: 40000, high: 60000 },
      evidenceLevel: 'Strong',
    });
    expect(response.body).not.toHaveProperty('id');
    expect(response.body).not.toHaveProperty('model');
    expect(response.headers['cache-control']).toBe('no-store');
    const previous = response.body.inputFingerprint;
    expect((await reference().expect(200)).body.inputFingerprint).toBe(
      previous,
    );
    await db.c.price_references.updateMany(
      { kind: 'CompletedSale', bookId },
      { $unset: { sourceGroup: '' } },
    );
    const changed = await reference().expect(200);
    expect(changed.body.evidenceLevel).toBe('Limited');
    expect(changed.body.inputFingerprint).not.toBe(previous);
    expect(await db.c.price_suggestions.countDocuments({ listingId })).toBe(0);
    expect(await db.c.price_assist_usage.countDocuments({})).toBe(0);
    expect(price.draft).not.toHaveBeenCalled();
  });
  it('requires current member owner eligibility on both endpoints', async () => {
    for (const actor of [other, staff, restricted]) {
      await scan([mediaId], actor).expect(actor === other ? 404 : 403);
      await reference(priceInput(), actor).expect(actor === other ? 404 : 403);
    }
    await request(app.getHttpServer())
      .post(`/api/v1/listings/${listingId}/isbn-matches`)
      .send({ mediaIds: [mediaId] })
      .expect(401);
    await db.c.listings.updateOne(
      { _id: listingId },
      { $set: { moderation: 'PendingReview' } },
    );
    try {
      await scan().expect(409);
      await reference().expect(409);
    } finally {
      await db.c.listings.updateOne(
        { _id: listingId },
        { $set: { moderation: 'Draft' } },
      );
    }
  });
  it('rejects duplicate/non-owned/not-ready images before reading storage', async () => {
    const calls = storage.read.mock.calls.length;
    await scan([mediaId, mediaId]).expect(422);
    await scan([randomUUID()]).expect(422);
    await db.c.listing_media.updateOne(
      { _id: mediaId },
      { $set: { status: 'Processing' } },
    );
    try {
      await scan().expect(422);
    } finally {
      await db.c.listing_media.updateOne(
        { _id: mediaId },
        { $set: { status: 'Ready' } },
      );
    }
    expect(storage.read).toHaveBeenCalledTimes(calls);
  });
  it('does not guess when photos contain two ISBNs or no book barcode', async () => {
    const second = await photo(await isbnImage('9780306406157'));
    const ambiguous = await scan([mediaId, second]).expect(200);
    expect(ambiguous.body).toMatchObject({
      status: 'Ambiguous',
      catalog: null,
      isbns: ['9780306406157', '9786041234567'],
    });
    const blank = await photo(
      await sharp({
        create: { width: 300, height: 200, channels: 3, background: 'white' },
      })
        .png()
        .toBuffer(),
    );
    expect((await scan([blank]).expect(200)).body.status).toBe('NotFound');
  });
  it('rechecks status after storage/decode instead of leaking a late authorized result', async () => {
    const fresh = await photo(await isbnImage());
    let release!: () => void;
    gate = new Promise<void>((r) => {
      release = r;
    });
    const reached = new Promise<void>((r) => {
      entered = r;
    });
    const response = scan([fresh]).then((r) => r);
    await reached;
    await db.setStatus(owner.id, 'RESTRICTED');
    release();
    try {
      expect((await response).status).toBe(403);
    } finally {
      gate = null;
      entered = null;
      await db.setStatus(owner.id, 'ACTIVE');
    }
  });
  it('respects missing inputs/refusal without a model and never creates usage', async () => {
    const refused = await reference({
      ...priceInput(),
      readable: false,
    }).expect(200);
    expect(refused.body).toMatchObject({ status: 'Refused', range: null });
    await reference({ ...priceInput(), bookId: randomUUID() }).expect(422);
    expect(await db.c.price_assist_usage.countDocuments({})).toBe(0);
  });
  it('reports an unavailable decoder honestly and retries it instead of caching a false miss', async () => {
    const fresh = await photo(await isbnImage());
    const decoder = vi
      .spyOn(app.get(IsbnBarcodeReader), 'read')
      .mockRejectedValueOnce(new Error('QA deadline'));
    try {
      expect((await scan([fresh]).expect(200)).body).toMatchObject({
        status: 'Unavailable',
        isbns: [],
        catalog: null,
      });
    } finally {
      decoder.mockRestore();
    }
    expect((await scan([fresh]).expect(200)).body.status).toBe('Found');
  });
  it('rejects invalid origin groups at the database while retaining legacy references', async () => {
    await expect(
      db.c.price_references.updateMany(
        { bookId },
        { $set: { sourceGroup: 'Display Name With Spaces' } },
      ),
    ).rejects.toMatchObject({ code: 121 });
    expect((await reference().expect(200)).body.evidenceLevel).toBe('Limited');
  });
  it('bounds concurrent storage/decoder work and returns Unavailable without pretending a miss', async () => {
    const a = await photo(await isbnImage()),
      b = await photo(await isbnImage()),
      c = await photo(await isbnImage());
    let release!: () => void,
      count = 0;
    gate = new Promise<void>((r) => {
      release = r;
    });
    const reached = new Promise<void>((r) => {
      entered = () => {
        if (++count === 2) r();
      };
    });
    const first = scan([a]).then((r) => r),
      second = scan([b]).then((r) => r);
    try {
      await reached;
      const busy = await scan([c]).expect(200);
      expect(busy.body).toMatchObject({
        status: 'Unavailable',
        isbns: [],
        catalog: null,
      });
      expect(count).toBe(2);
    } finally {
      release();
      await Promise.all([first, second]);
      gate = null;
      entered = null;
    }
  });
  it('imports curated origin mappings with dry-run, replay and atomic conflict rollback on QA only', async () => {
    const url = process.env.MONGO_FIXTURE_URL!;
    if (!url.includes('127.0.0.1:57017/') || !url.includes('_test'))
      throw new Error('QA importer only');
    const folder = await mkdtemp(resolve('.tmp-origin-qa-')),
      file = join(folder, 'references.json');
    const entry = {
      bookId,
      isbn: '9786041234567',
      kind: 'CoverPrice',
      amount: 123000,
      condition: null,
      sourceLabel: 'CLI synthetic reference',
      sourceUrl: 'https://curated.example/book',
      observedAt: new Date().toISOString().slice(0, 10),
      enteredBy: 'QA',
      rightsNote: 'Synthetic QA only',
    };
    const run = async (entries: object[], apply = false) => {
      await writeFile(file, JSON.stringify(entries));
      try {
        const result = await promisify(execFile)(
          process.execPath,
          [
            '--import',
            'tsx',
            resolve('src/price-refs-import.ts'),
            file,
            ...(apply ? ['--apply'] : []),
          ],
          {
            timeout: 15000,
            env: { ...process.env, MONGODB_MIGRATOR_URL: url },
          },
        );
        return { code: 0, stdout: result.stdout };
      } catch (error) {
        return { code: (error as { code: number }).code, stdout: '' };
      }
    };
    try {
      const dry = await run([entry, entry]);
      expect(dry.code).toBe(0);
      expect(dry.stdout).toContain('1 new');
      expect(
        await db.c.price_references.countDocuments({
          sourceLabel: entry.sourceLabel,
        }),
      ).toBe(0);
      expect((await run([entry], true)).code).toBe(0);
      const before = await db.c.price_references.findOne({
        sourceLabel: entry.sourceLabel,
      });
      const mapped = { ...entry, sourceGroup: 'qa-curated-publisher' };
      expect((await run([mapped])).code).toBe(0);
      expect(await db.c.price_references.findOne({ _id: before!._id })).toEqual(
        before,
      );
      expect((await run([mapped], true)).code).toBe(0);
      const after = await db.c.price_references.findOne({ _id: before!._id });
      expect(after).toEqual({ ...before, sourceGroup: mapped.sourceGroup });
      expect((await run([mapped], true)).code).toBe(0);
      expect(await db.c.price_references.findOne({ _id: before!._id })).toEqual(
        after,
      );
      const fresh = { ...entry, sourceLabel: 'CLI must roll back' };
      expect(
        (
          await run(
            [fresh, { ...mapped, sourceGroup: 'conflicting-organization' }],
            true,
          )
        ).code,
      ).not.toBe(0);
      expect(
        await db.c.price_references.countDocuments({
          sourceLabel: fresh.sourceLabel,
        }),
      ).toBe(0);
      expect(await db.c.price_references.findOne({ _id: before!._id })).toEqual(
        after,
      );
      expect(
        (await run([{ ...fresh, observedAt: '2026-02-31' }], true)).code,
      ).not.toBe(0);
    } finally {
      await unlink(file);
      await rmdir(folder);
    }
  }, 30000);
});
