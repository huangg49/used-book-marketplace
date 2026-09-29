import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { bindCollections } from '../src/database/mongo/collections.js';
import type {
  MutationReceiptDoc,
  RoleCode,
} from '../src/database/mongo/documents.js';
import { migrate, pendingMigrations } from '../src/database/mongo/migrate.js';
import {
  backfillTitleKeys,
  titleKey,
} from '../src/database/mongo/migrations/0003-catalog-title-key.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { isbn13 } from '../src/modules/commands/contract-input.service.js';
import { checkListing } from '../src/modules/listings/listing-projection.js';
import {
  CHECKLIST,
  failsCommitCheck,
  ListingFixtures,
  listingContent,
  type ListingFixture,
} from './helpers/media-listings.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

type Actor = { id: string; sessionId: string; token: string };
const rejectsWith = (promise: Promise<unknown>, code: number) =>
  expect(promise).rejects.toMatchObject({ code });

// PostgreSQL enforced these listing/catalog/command-history invariants with
// CHECKs, FKs, triggers and deferred constraint triggers. On MongoDB each one
// maps (docs/refactor/MIG02_MODEL_MAP.md) to a validator (121), a unique index
// (11000), an app-user privilege (13), the services' write protocol (W) or a
// commit-time check (C). W and C are application code: where a raw write can
// still land, the test shows the next API command on the aggregate fails.
describe('listing/catalog persistence invariants on MongoDB', () => {
  let app: INestApplication, db: MongoFixtures, fx: ListingFixtures;
  let mongo: MongoService;
  let owner: Actor, reviewer: Actor, reviewer2: Actor;
  const users: string[] = [];
  const books: string[] = [];
  const listings: string[] = [];
  let confirmedBook: string;

  async function actor(roles: RoleCode[]): Promise<Actor> {
    const user = await db.user({ roles, displayName: 'Schema Reader' });
    users.push(user._id);
    const sessionId = await db.session(user._id);
    return {
      id: user._id,
      sessionId,
      token: await app
        .get(JwtService)
        .signAsync({ sub: user._id, sid: sessionId }),
    };
  }
  const send = (
    who: Actor,
    method: 'post' | 'put',
    path: string,
    body: object,
    key = randomUUID(),
  ) =>
    request(app.getHttpServer())
      [method]('/api/v1' + path)
      .auth(who.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(body);
  const listing = async (pending = false, bookId = confirmedBook) => {
    const item = await fx.listing(owner.id, bookId, pending);
    listings.push(item.id);
    return item;
  };
  const book = async (confirmed = true, isbn: string | null = null) => {
    const b = await fx.book(owner.id, reviewer.id, confirmed, isbn);
    books.push(b.id);
    return b;
  };
  const draftContent = (item: ListingFixture, over: object = {}) => ({
    bookId: confirmedBook,
    ...listingContent,
    mediaIds: [item.media],
    ...over,
  });
  const save = (item: ListingFixture, version: number, over: object = {}) =>
    send(owner, 'put', `/listings/${item.id}/draft`, {
      expectedVersion: version,
      content: draftContent(item, over),
    });
  // A listing command that runs checkListing before commit.
  const archive = (id: string, version: number) =>
    send(owner, 'post', `/listings/${id}/archive`, {
      expectedVersion: version,
    });
  const decide = (
    who: Actor,
    item: ListingFixture,
    version: number,
    decision: 'Approve' | 'Reject' = 'Approve',
  ) =>
    send(
      who,
      'post',
      `/operations/listings/${item.id}/decision`,
      decision === 'Approve'
        ? {
            expectedVersion: version,
            revisionId: item.revision,
            decision,
            checklist: CHECKLIST,
          }
        : {
            expectedVersion: version,
            revisionId: item.revision,
            decision,
            reason: 'Ảnh chưa đủ rõ để đối chiếu tình trạng.',
          },
    );
  const decisions = (item: ListingFixture) =>
    db.c.listing_decisions.countDocuments({ revisionId: item.revision });
  const receipt = (listingId: string, key = randomUUID()) => {
    const id = randomUUID();
    const doc: MutationReceiptDoc = {
      _id: id,
      principal: `user:${owner.id}`,
      actorId: owner.id,
      systemActor: null,
      operation: 'schemaProbe',
      key,
      payloadHash: 'a'.repeat(64),
      listingId,
      bookId: null,
      mediaId: null,
      addressBookId: null,
      quoteId: null,
      contextId: null,
      topupId: null,
      resultVersion: 1,
      result: {
        id,
        entityType: 'Listing',
        entityId: listingId,
        version: 1,
        revisionId: null,
        state: null,
        serverTime: new Date().toISOString(),
      },
      committedAt: new Date(),
    };
    return doc;
  };
  const audit = (receiptId: string, listingId: string) => ({
    _id: randomUUID(),
    actorId: owner.id,
    systemActor: null,
    receiptId,
    listingId,
    bookId: null,
    mediaId: null,
    addressBookId: null,
    quoteId: null,
    contextId: null,
    topupId: null,
    action: 'SchemaProbe',
    before: null,
    after: null,
    reason: null,
    requestId: randomUUID(),
    createdAt: new Date(),
  });
  const outbox = (auditId: string) => ({
    _id: randomUUID(),
    auditId,
    type: 'SchemaProbe',
    payload: {},
    attempts: 0,
    availableAt: new Date(),
    leaseUntil: null,
    processedAt: null,
    createdAt: new Date(),
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    mongo = app.get(MongoService);
    db = await MongoFixtures.connect();
    fx = new ListingFixtures(db);
    owner = await actor(['MEMBER', 'STAFF']);
    reviewer = await actor(['STAFF']);
    reviewer2 = await actor(['STAFF']);
    confirmedBook = (await book()).id;
  }, 60000);
  afterAll(async () => {
    if (db) {
      await fx.remove(listings, books, users);
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
  });

  it('re-runs migrations without changing existing accounts and upgrades legacy catalog documents in place', async () => {
    // PostgreSQL: applying the listing migration over the auth schema kept the
    // existing account and created the listing tables. MongoDB: migrations are
    // checksummed and idempotent; the one data migration backfills in place.
    const legacy = await db.user({
      passwordHash: 'test-fixture-not-a-login-secret',
    });
    users.push(legacy._id);
    const legacyBook = randomUUID(),
      legacyRevision = randomUUID(),
      title = 'Đất Rừng Phương Nam';
    books.push(legacyBook);
    const now = new Date();
    await db.c.catalog_revisions.insertOne({
      _id: legacyRevision,
      bookId: legacyBook,
      number: 1,
      title,
      authors: ['Đoàn Giỏi'],
      publisher: null,
      publicationYear: null,
      language: 'vi',
      edition: null,
      category: 'Văn học',
      isbn: null,
      submittedAt: now,
    });
    // A book written before migration 0003 has no titleKey (the current
    // validator requires it, so only a validation bypass can create one).
    await db.client
      .db()
      .collection('catalog_books')
      .insertOne(
        {
          _id: legacyBook,
          requesterId: legacy._id,
          status: 'Pending',
          version: 1,
          currentRevisionId: legacyRevision,
          confirmedIsbn: null,
          searchText: 'dat rung phuong nam',
          createdAt: now,
          updatedAt: now,
          lockSeq: 0,
        } as never,
        { bypassDocumentValidation: true },
      );
    expect(await migrate(db.client, db.client.db())).toEqual([]);
    expect(await pendingMigrations(mongo.db)).toEqual([]);
    expect(await db.c.users.findOne({ _id: legacy._id })).toEqual(legacy);
    await backfillTitleKeys(db.client.db());
    expect(await db.c.catalog_books.findOne({ _id: legacyBook })).toEqual({
      _id: legacyBook,
      requesterId: legacy._id,
      status: 'Pending',
      version: 1,
      currentRevisionId: legacyRevision,
      confirmedIsbn: null,
      searchText: 'dat rung phuong nam',
      titleKey: titleKey(title),
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    const names = new Set(
      (await db.client.db().listCollections().toArray())
        .filter(
          (c) => (c as { options?: { validator?: object } }).options?.validator,
        )
        .map((c) => c.name),
    );
    for (const name of [
      'users',
      'auth_sessions',
      'catalog_books',
      'catalog_revisions',
      'catalog_decisions',
      'listings',
      'listing_revisions',
      'listing_media',
      'revision_media',
      'listing_decisions',
      'mutation_receipts',
      'audit_events',
      'outbox_events',
      'media_processing_jobs',
    ])
      expect(names.has(name), name).toBe(true);
  });

  it('rejects incomplete aggregates at commit and permits transactional construction', async () => {
    const id = randomUUID();
    const bare = {
      _id: id,
      ownerId: owner.id,
      version: 1,
      moderation: 'Draft' as const,
      visibility: 'Visible' as const,
      trade: 'Available' as const,
      currentRevisionId: null,
      removalReason: null,
      deletedAt: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lockSeq: 0,
    };
    listings.push(id);
    await expect(
      fx.commit((tx) => tx.c.listings.insertOne(bare), { listing: id }),
    ).rejects.toThrow('Listing requires its own current revision');
    expect(await db.c.listings.findOne({ _id: id })).toBeNull();
    const item = await listing();
    expect(
      (await db.c.listings.findOne({ _id: item.id }))!.currentRevisionId,
    ).toBe(item.revision);
    // The validator cannot see other documents: a raw app-user insert lands,
    // and the next command on it fails its commit-time check.
    await mongo.c.listings.insertOne(bare);
    await failsCommitCheck(
      () => archive(id, 1),
      'Listing requires its own current revision',
    );
    expect(await db.c.listings.findOne({ _id: id })).toMatchObject({
      version: 1,
      deletedAt: null,
    });
  });

  it('rejects wrong-owner revision pointers, version bypass and ownership transfer', async () => {
    const one = await listing(),
      two = await listing();
    const pointer = {
      $set: { currentRevisionId: two.revision },
      $inc: { version: 1 },
    };
    await expect(
      fx.commit((tx) => tx.c.listings.updateOne({ _id: one.id }, pointer), {
        listing: one.id,
      }),
    ).rejects.toThrow('Listing requires its own current revision');
    await mongo.c.listings.updateOne({ _id: one.id }, pointer);
    await expect(mongo.tx((tx) => checkListing(tx, one.id))).rejects.toThrow(
      'Listing requires its own current revision',
    );
    await failsCommitCheck(
      () => archive(one.id, 2),
      'Listing requires its own current revision',
    );
    expect(
      (await db.c.listings.findOne({ _id: one.id }))!.deletedAt,
    ).toBeNull();
    // Version bypass (W): every write names the version it read and advances
    // it by exactly one; a stale version is a conflict.
    await save(two, 2).expect(409);
    const saved = await save(two, 1).expect(200);
    expect(saved.body.version).toBe(2);
    expect((await db.c.listings.findOne({ _id: two.id }))!.version).toBe(2);
    // Ownership transfer (W): no command input can carry an owner.
    await send(owner, 'put', `/listings/${two.id}/draft`, {
      expectedVersion: 2,
      content: draftContent(two),
      ownerId: reviewer.id,
    }).expect(422);
    expect((await db.c.listings.findOne({ _id: two.id }))!.ownerId).toBe(
      owner.id,
    );
  });

  it('enforces price/mode and complete submitted-content constraints including nulls', async () => {
    const item = await listing();
    // Validators bind the least-privilege application user too.
    await rejectsWith(
      mongo.c.listing_revisions.updateOne(
        { _id: item.revision },
        { $set: { salePrice: 9999 } },
      ),
      121,
    );
    await rejectsWith(
      mongo.c.listing_revisions.updateOne(
        { _id: item.revision },
        { $set: { mode: null } },
      ),
      121,
    );
    const now = new Date();
    await rejectsWith(
      mongo.c.listing_revisions.updateOne(
        { _id: item.revision },
        {
          $set: { submittedAt: now, ownershipDeclaredAt: now, readable: false },
        },
      ),
      121,
    );
  });

  it('blocks cross-listing photos and mutation of submitted content/photo order', async () => {
    const pending = await listing(true),
      other = await listing();
    // W: a draft may only reference its own listing's photos.
    await save(other, 1, { mediaIds: [other.media, pending.media] }).expect(
      422,
    );
    // A raw link lands (revision_media is app-deletable), but submission
    // re-verifies every photo belongs to the listing, so nothing is frozen.
    await mongo.c.revision_media.insertOne({
      _id: `${other.revision}:${pending.media}`,
      listingId: other.id,
      revisionId: other.revision,
      mediaId: pending.media,
      position: 1,
    });
    await send(owner, 'post', `/listings/${other.id}/submit`, {
      expectedVersion: 1,
      ownershipDeclared: true,
    }).expect(422);
    expect((await db.c.listings.findOne({ _id: other.id }))!.moderation).toBe(
      'Draft',
    );
    // W: submitted content and photo order change only through a new
    // revision; a draft save of a submitted revision is refused.
    const before = await db.c.listing_revisions.findOne({
      _id: pending.revision,
    });
    await save(pending, 2, {
      description: 'replacement '.repeat(4),
      mediaIds: [],
    }).expect(409);
    expect(
      await db.c.listing_revisions.findOne({ _id: pending.revision }),
    ).toEqual(before);
    expect(
      await db.c.revision_media.countDocuments({
        revisionId: pending.revision,
      }),
    ).toBe(1);
    // C: removing a submitted revision's photos is detected at commit; the
    // next decision on the listing fails and records nothing.
    await mongo.c.revision_media.deleteMany({ revisionId: pending.revision });
    await expect(
      mongo.tx((tx) => checkListing(tx, pending.id)),
    ).rejects.toThrow('Submission requires 1-8 Ready photos');
    await failsCommitCheck(
      () => decide(reviewer, pending, 2, 'Reject'),
      'Submission requires 1-8 Ready photos',
    );
    expect(await decisions(pending)).toBe(0);
  });

  it('requires ready photos and a decision rather than allowing direct Approved writes', async () => {
    const item = await listing();
    await db.c.revision_media.deleteMany({ revisionId: item.revision });
    await send(owner, 'post', `/listings/${item.id}/submit`, {
      expectedVersion: 1,
      ownershipDeclared: true,
    }).expect(422);
    const now = new Date();
    await expect(
      fx.commit(
        async (tx) => {
          await tx.c.listing_revisions.updateOne(
            { _id: item.revision },
            { $set: { submittedAt: now, ownershipDeclaredAt: now } },
          );
          await tx.c.listings.updateOne(
            { _id: item.id },
            { $set: { moderation: 'PendingReview', version: 2 } },
          );
        },
        { listing: item.id },
      ),
    ).rejects.toThrow('Submission requires 1-8 Ready photos');
    const approved = { $set: { moderation: 'Approved' as const, version: 2 } };
    await expect(
      fx.commit((tx) => tx.c.listings.updateOne({ _id: item.id }, approved), {
        listing: item.id,
      }),
    ).rejects.toThrow('Moderation does not match current revision/decision');
    expect(await db.c.listings.findOne({ _id: item.id })).toMatchObject({
      moderation: 'Draft',
      version: 1,
    });
    await mongo.c.listings.updateOne({ _id: item.id }, approved);
    await failsCommitCheck(
      () => archive(item.id, 2),
      'Moderation does not match current revision/decision',
    );
    expect(
      (await db.c.listings.findOne({ _id: item.id }))!.deletedAt,
    ).toBeNull();
  });

  it('requires independent reviewers and confirmed catalog at approval', async () => {
    const pendingBook = await book(false),
      item = await listing(true, pendingBook.id);
    const self = await decide(owner, item, 2).expect(403);
    expect(self.body.code).toBe('SelfReviewForbidden');
    const unconfirmed = await decide(reviewer, item, 2).expect(409);
    expect(unconfirmed.body.code).toBe('CatalogNotConfirmed');
    expect(await decisions(item)).toBe(0);
    // C: a direct approval of an unconfirmed catalog fails at commit.
    await expect(
      fx.commit(
        async (tx) => {
          await tx.c.listing_decisions.insertOne({
            _id: randomUUID(),
            revisionId: item.revision,
            reviewerId: reviewer.id,
            decision: 'Approve',
            checklist: CHECKLIST,
            reason: null,
            decidedAt: new Date(),
          });
          await tx.c.listings.updateOne(
            { _id: item.id },
            {
              $set: { moderation: 'Approved', publishedAt: new Date() },
              $inc: { version: 1 },
            },
          );
        },
        { listing: item.id },
      ),
    ).rejects.toThrow('Approval requires confirmed catalog');
    expect(await decisions(item)).toBe(0);
    // C (latlai_guard_decision): a raw self-review fails at commit even when
    // everything else about the approval is valid.
    const own = await listing(true);
    await expect(
      fx.commit(
        async (tx) => {
          await tx.c.listing_decisions.insertOne({
            _id: randomUUID(),
            revisionId: own.revision,
            reviewerId: owner.id,
            decision: 'Approve',
            checklist: CHECKLIST,
            reason: null,
            decidedAt: new Date(),
          });
          await tx.c.listings.updateOne(
            { _id: own.id },
            {
              $set: { moderation: 'Approved', publishedAt: new Date() },
              $inc: { version: 1 },
            },
          );
        },
        { listing: own.id },
      ),
    ).rejects.toThrow('Stale revision or self-review');
    expect(await decisions(own)).toBe(0);
  });

  it('serializes conflicting review versions at a listing lock with one winner', async () => {
    const item = await listing(true);
    const gate = await Gate.lock(db.client, 'listings', [item.id]);
    let pending: Promise<request.Response>[] = [];
    try {
      pending = [
        decide(reviewer, item, 2, 'Approve').then((r) => r),
        decide(reviewer2, item, 2, 'Reject').then((r) => r),
      ];
      await gate.contended(2);
      await gate.commit();
      expect((await Promise.all(pending)).map((r) => r.status).sort()).toEqual([
        200, 409,
      ]);
      expect(await decisions(item)).toBe(1);
      expect((await db.c.listings.findOne({ _id: item.id }))!.version).toBe(3);
    } finally {
      await gate.close();
      await Promise.allSettled(pending);
    }
  });

  it('deduplicates concurrent command receipts at the database unique key', async () => {
    const item = await listing(),
      key = randomUUID();
    const session = mongo.client.startSession();
    try {
      session.startTransaction({ writeConcern: { w: 'majority' } });
      await bindCollections(mongo.db, session).mutation_receipts.insertOne(
        receipt(item.id, key),
      );
      // A second writer overlaps the uncommitted key and waits for it.
      const loser = mongo.c.mutation_receipts
        .insertOne(receipt(item.id, key))
        .then(
          () => null,
          (error: unknown) => error,
        );
      const early = await Promise.race([
        loser.then(() => 'settled'),
        new Promise((resolve) => setTimeout(() => resolve('waiting'), 300)),
      ]);
      expect(early).toBe('waiting');
      await session.commitTransaction();
      expect(await loser).toMatchObject({ code: 11000 });
    } finally {
      if (session.inTransaction()) await session.abortTransaction();
      await session.endSession();
    }
    expect(await db.c.mutation_receipts.countDocuments({ key })).toBe(1);
  });

  it('rolls back receipt, audit and outbox with a failed domain transaction', async () => {
    const item = await listing(),
      key = randomUUID();
    let auditId = '';
    await expect(
      mongo.tx(async (tx) => {
        const command = receipt(item.id, key);
        await tx.c.mutation_receipts.insertOne(command);
        const event = audit(command._id, item.id);
        auditId = event._id;
        await tx.c.audit_events.insertOne(event);
        await tx.c.outbox_events.insertOne(outbox(event._id));
        throw new Error('injected-before-commit');
      }),
    ).rejects.toThrow('injected-before-commit');
    expect(await db.c.mutation_receipts.countDocuments({ key })).toBe(0);
    expect(await db.c.audit_events.countDocuments({ _id: auditId })).toBe(0);
    expect(await db.c.outbox_events.countDocuments({ auditId })).toBe(0);
  });

  it('preserves receipts, audit and outbox payload while permitting worker delivery metadata', async () => {
    const item = await listing(),
      command = receipt(item.id),
      event = audit(command._id, item.id),
      message = outbox(event._id);
    await mongo.c.mutation_receipts.insertOne(command);
    await mongo.c.audit_events.insertOne(event);
    await mongo.c.outbox_events.insertOne(message);
    // Append-only history: the application user may not delete or rewrite it.
    await rejectsWith(
      mongo.c.mutation_receipts.deleteOne({ _id: command._id }),
      13,
    );
    await rejectsWith(
      mongo.c.audit_events.updateOne(
        { _id: event._id },
        { $set: { action: 'rewrite' } },
      ),
      13,
    );
    await rejectsWith(
      mongo.c.outbox_events.deleteOne({ _id: message._id }),
      13,
    );
    // Outbox is mutable only for delivery metadata (W: the payload is never $set).
    const processedAt = new Date();
    await mongo.c.outbox_events.updateOne(
      { _id: message._id },
      { $set: { attempts: 1, processedAt } },
    );
    expect(await db.c.outbox_events.findOne({ _id: message._id })).toEqual({
      ...message,
      attempts: 1,
      processedAt,
    });
  });

  it('validates ISBN checksums and collapses ISBN-10/13 to one confirmed identity', async () => {
    expect(isbn13('0306406152')).toBe('9780306406157');
    await rejectsWith(book(false, '9780306406158'), 121);
    await book(true, '0306406152');
    await rejectsWith(book(true, '9780306406157'), 11000);
    await expect(book(false, '9780306406157')).resolves.toHaveProperty(
      'revision',
    );
  });

  it('retains reviewed media and disallows replacement or purge under a revision', async () => {
    const item = await listing(true),
      draft = await listing();
    // W: a Ready photo never re-enters upload/processing through the API.
    await send(
      owner,
      'post',
      `/listings/${draft.id}/media/${draft.media}/finalize`,
      { expectedVersion: 1 },
    ).expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/listings/${draft.id}/media/${draft.media}/upload-ticket`)
      .auth(owner.token, { type: 'bearer' })
      .expect(409);
    // P: the application user cannot delete a photo.
    await rejectsWith(mongo.c.listing_media.deleteOne({ _id: item.media }), 13);
    // C: purging a photo of a submitted revision is detected at commit and
    // the next decision fails without recording one.
    await mongo.c.listing_media.updateOne(
      { _id: item.media },
      {
        $set: { purgedAt: new Date(), updatedAt: new Date() },
        $inc: { version: 1 },
      },
    );
    await expect(mongo.tx((tx) => checkListing(tx, item.id))).rejects.toThrow(
      'Submission requires 1-8 Ready photos',
    );
    await failsCommitCheck(
      () => decide(reviewer, item, 2, 'Reject'),
      'Submission requires 1-8 Ready photos',
    );
    expect(await decisions(item)).toBe(0);
  });
});
