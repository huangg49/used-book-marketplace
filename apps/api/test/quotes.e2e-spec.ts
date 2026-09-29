import { QuoteClock } from '../src/modules/quotes/quote-clock.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type {
  ListingDoc,
  RoleCode,
  UserStatus,
} from '../src/database/mongo/documents.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import {
  onTransactionRetry,
  type Tx,
} from '../src/database/mongo/transaction.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { validates } from './helpers/contract.js';
import { Gate } from './helpers/mongo-gate.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// Storage signing is deliberately faked. HTTP, authorization and MongoDB are real.
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
// lockSeq is the lock counter every command bumps when it locks a document
// (the analogue of taking a PostgreSQL row lock), not listing state.
const state = ({ lockSeq: _lock, ...rest }: ListingDoc) => rest;

describe('DirectDelivery quote HTTP and MongoDB', () => {
  let app: INestApplication, db: MongoFixtures;
  const users: string[] = [];
  let m2: Reader, a1: Reader, a2: Reader, staff: Reader;
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
  async function createCatalog(actor: Reader, meta = metadata()) {
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
  async function createDraft(actor: Reader, content = draft()) {
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
  const setSession = (id: string, set: Record<string, unknown>) =>
    db.c.auth_sessions.updateOne(
      { _id: id },
      { $set: set, $inc: { lockSeq: 1 } },
    );
  // Observes command transactions retrying against a write lock held by
  // another transaction (a session queued behind a PostgreSQL row lock).
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

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
    m2 = await reader();
    a1 = await reader(['MEMBER', 'ADMIN']);
    a2 = await reader(['ADMIN']);
    staff = await reader(['STAFF']);
  }, 60000);
  afterAll(async () => {
    if (db) {
      const c = db.c;
      await c.sale_quote_policy_selection.updateOne(
        { _id: 'DirectSale' },
        { $set: { policyCode: 'HCM-DIRECT-v1' } },
      );
      await c.sale_quote_policies.deleteMany({ _id: 'QA-POLICY' });
      await c.sale_quotes.deleteMany({ buyerId: { $in: users } });
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
    actor: Reader,
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
  const submit = (l: Record<string, any>, actor: Reader, key = randomUUID()) =>
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
  async function pending(actor: Reader, confirmed = true) {
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
  const quoteCount = (filter: { buyerId?: string; listingId?: string }) =>
    db.c.sale_quotes.countDocuments(filter);
  it('quotes server-calculated money, private versions and five-minute expiry without reserving or changing the listing', async () => {
    const f = await setup(),
      before = (await db.c.listings.findOne({ _id: f.l.entityId }))!;
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
      state((await db.c.listings.findOne({ _id: f.l.entityId }))!),
    ).toEqual(state(before));
    expect(
      (await get(`/listings/${f.l.entityId}`).expect(200)).body.version,
    ).toBe(before.version);
    // An upper-case path id is the same quote (UUIDs are case-insensitive).
    expect((await readQuote(q.id.toUpperCase(), f.buyer)).id).toBe(q.id);
    for (const secret of [
      addressInput.recipientName,
      addressInput.phone,
      addressInput.detail,
      f.origin.id,
    ])
      expect(JSON.stringify(q)).not.toContain(secret);
    const receipts = await db.c.mutation_receipts
        .find({ quoteId: q.id })
        .toArray(),
      audits = await db.c.audit_events.find({ quoteId: q.id }).toArray();
    expect(receipts).toHaveLength(1);
    expect(audits).toHaveLength(1);
    // Outbox events carry no quote id; they join through their audit event.
    expect(
      await db.c.outbox_events.countDocuments({
        auditId: { $in: audits.map((a) => a._id) },
      }),
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
    expect(await quoteCount({ listingId: f.l.entityId })).toBe(0);
  });
  it('allows buyer only; rejects guest/staff/foreign reads and new quotes from Restricted/Locked/roleless users', async () => {
    const f = await setup(),
      r = (await quote(f).expect(200)).body;
    await get(`/me/quotes/${r.entityId}`).expect(401);
    await get(`/me/quotes/${r.entityId}`, staff).expect(403);
    await get(`/me/quotes/${r.entityId}`, f.seller).expect(404);
    await get(`/me/quotes/${r.entityId}`, m2).expect(404);
    await setUser(f.buyer.id, { status: 'RESTRICTED' });
    expect((await readQuote(r.entityId, f.buyer)).assessment).toBe(
      'Unavailable',
    );
    await quote(f).expect(403);
    await setUser(f.buyer.id, { status: 'LOCKED' });
    await get(`/me/quotes/${r.entityId}`, f.buyer).expect(403);
    await quote(f).expect(403);
    await setUser(f.buyer.id, { status: 'ACTIVE' });
    await setUser(f.buyer.id, { roles: [] });
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
    const row = (await db.c.sale_quotes.findOne({ _id: r.entityId }))!,
      clock = vi
        .spyOn(app.get(QuoteClock), 'now')
        .mockResolvedValue(row.expiresAt);
    try {
      expect((await readQuote(r.entityId, f.buyer)).assessment).toBe('Expired');
      expect((await quote(f, key).expect(200)).body).toEqual(r);
    } finally {
      clock.mockRestore();
    }
    await setSession(f.buyer.sessionId, { revokedAt: new Date() });
    await quote(f, key).expect(401);
    expect(await quoteCount({ buyerId: f.buyer.id })).toBe(1);
  });
  it('expiry boundaries use server time and reads never renew stored estimates', async () => {
    const f = await setup(),
      r = (await quote(f).expect(200)).body,
      row = (await db.c.sale_quotes.findOne({ _id: r.entityId }))!;
    const clock = vi.spyOn(app.get(QuoteClock), 'now');
    try {
      for (const [offset, status] of [
        [-1, 'Current'],
        [0, 'Expired'],
        [1, 'Expired'],
      ] as const) {
        clock.mockResolvedValue(new Date(row.expiresAt.getTime() + offset));
        const q = await readQuote(row._id, f.buyer);
        expect(q.assessment).toBe(status);
        expect(q.expiresAt).toBe(row.expiresAt.toISOString());
      }
    } finally {
      clock.mockRestore();
    }
    expect(await db.c.sale_quotes.findOne({ _id: row._id })).toEqual(row);
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
    // Reference data is maintained by the migrator, as SQL migrations did.
    await db.c.sale_quote_policies.insertOne({
      _id: 'QA-POLICY',
      shippingFee: 40000,
      commissionBps: 600,
      ttlSeconds: 120,
    });
    await db.c.sale_quote_policy_selection.updateOne(
      { _id: 'DirectSale' },
      { $set: { policyCode: 'QA-POLICY' } },
    );
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
      // Policy rows are immutable for the application (P: find only).
      await expect(
        app
          .get(MongoService)
          .c.sale_quote_policies.updateOne(
            { _id: 'QA-POLICY' },
            { $set: { shippingFee: 0 } },
          ),
      ).rejects.toMatchObject({ code: 13 });
    } finally {
      await db.c.sale_quote_policy_selection.updateOne(
        { _id: 'DirectSale' },
        { $set: { policyCode: 'HCM-DIRECT-v1' } },
      );
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
    await setUser(f.seller.id, { status: 'RESTRICTED' });
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
      gate = await Gate.lockUser(db.client, f.buyer.id);
    const responses = [
      quote(f, key).then((r) => r),
      quote(f, key).then((r) => r),
    ];
    try {
      await gate.contended(2);
      await gate.commit();
      const [a, c] = await Promise.all(responses);
      expect(a.status).toBe(200);
      expect(c.body).toEqual(a.body);
      expect(await quoteCount({ buyerId: f.buyer.id })).toBe(1);
      expect(
        await db.c.audit_events.countDocuments({ quoteId: a.body.entityId }),
      ).toBe(1);
    } finally {
      await gate.close();
      await Promise.allSettled(responses);
    }
  });
  it('quota races allow only the twentieth unexpired quote; expiry releases quota without deleting history', async () => {
    const f = await setup();
    for (let i = 0; i < 19; i++) await quote(f).expect(200);
    const gate = await Gate.lockUser(db.client, f.buyer.id),
      responses = [quote(f).then((r) => r), quote(f).then((r) => r)];
    try {
      await gate.contended(2);
      await gate.commit();
      expect(
        (await Promise.all(responses)).map((r) => r.status).sort(),
      ).toEqual([200, 429]);
    } finally {
      await gate.close();
      await Promise.allSettled(responses);
    }
    const [latest] = await db.c.sale_quotes
        .find({ buyerId: f.buyer.id })
        .sort({ expiresAt: -1 })
        .limit(1)
        .toArray(),
      clock = vi
        .spyOn(app.get(QuoteClock), 'now')
        .mockResolvedValue(new Date(latest.expiresAt.getTime() + 1));
    try {
      await quote(f).expect(200);
      expect(await quoteCount({ buyerId: f.buyer.id })).toBe(21);
    } finally {
      clock.mockRestore();
    }
  });
  it.each(['address', 'role', 'hidden'] as const)(
    'rechecks %s changes that win the lock before quote creation',
    async (kind) => {
      const f = await setup(),
        gate = await Gate.lockUser(db.client, f.seller.id),
        response = quote(f).then((r) => r);
      try {
        await gate.contended();
        const inGate = { session: gate.session };
        // Raw writes inside the lock holder's transaction, each following the
        // write protocol of its collection (content version +1, lockSeq bump).
        if (kind === 'address')
          await gate.db
            .collection<{ _id: string }>('member_addresses')
            .updateOne(
              { _id: f.origin.id },
              { $set: { detail: 'Gate address change' }, $inc: { version: 1 } },
              inGate,
            );
        else if (kind === 'role')
          await gate.db
            .collection<{ _id: string }>('users')
            .updateOne({ _id: f.seller.id }, { $set: { roles: [] } }, inGate);
        else
          await gate.db.collection<{ _id: string }>('listings').updateOne(
            { _id: f.l.entityId },
            {
              $set: { visibility: 'Hidden', updatedAt: new Date() },
              $inc: { version: 1, lockSeq: 1 },
            },
            inGate,
          );
        await gate.commit();
        expect((await response).status).toBe(409);
        expect(await quoteCount({ listingId: f.l.entityId })).toBe(0);
      } finally {
        await gate.close();
        await response;
      }
    },
  );
  it('quote winning first does not block a subsequent address update; subsequent assessment is Changed', async () => {
    const f = await setup(),
      clock = app.get(QuoteClock),
      original = clock.now.bind(clock);
    // Test-only pause of the quote at its decision clock, inside its
    // transaction and while it holds the buyer/seller/listing locks.
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve)),
      released = new Promise<void>((resolve) => (release = resolve));
    const spy = vi
      .spyOn(clock, 'now')
      .mockImplementationOnce(async (tx: Tx) => {
        entered();
        await released;
        return original(tx);
      });
    const retries = watchRetries();
    const response = quote(f).then((r) => r);
    let mutation: Promise<request.Response> | undefined;
    try {
      await reached;
      const version = (await db.c.address_books.findOne({
        _id: f.seller.id,
      }))!.version;
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
      // The address update contends for the seller lock the quote holds.
      await retries.until(1);
      release();
      const q = await response;
      expect(q.status).toBe(200);
      expect((await mutation).status).toBe(200);
      expect((await readQuote(q.body.entityId, f.buyer)).assessment).toBe(
        'Changed',
      );
    } finally {
      release();
      retries.stop();
      spy.mockRestore();
      await response;
      await mutation;
    }
  });
  it('takes decision time after resource contention and rejects a session expiring while waiting', async () => {
    const f = await setup(),
      gate = await Gate.lock(db.client, 'listings', [f.l.entityId]);
    const expiresAt = new Date(Date.now() + 60000);
    await setSession(f.buyer.sessionId, { expiresAt });
    const clock = vi
        .spyOn(app.get(QuoteClock), 'now')
        .mockResolvedValue(expiresAt),
      response = quote(f).then((r) => r);
    try {
      await gate.contended();
      expect(clock).not.toHaveBeenCalled();
      await gate.commit();
      expect((await response).status).toBe(401);
      expect(await quoteCount({ buyerId: f.buyer.id })).toBe(0);
    } finally {
      await gate.close();
      await response;
      clock.mockRestore();
    }
  });
  it('immutable quote snapshot and balanced amounts reject forgery; audit failure rolls back quote and permits retry', async () => {
    const f = await setup(),
      key = randomUUID();
    // Temporary validator rule (like the former failing SQL trigger).
    await db.withRejectingValidator(
      'audit_events',
      { action: 'createSaleQuote', actorId: f.buyer.id },
      async () => {
        await quote(f, key).expect(500);
        expect(await quoteCount({ buyerId: f.buyer.id })).toBe(0);
      },
    );
    const r = (await quote(f, key).expect(200)).body,
      q = (await db.c.sale_quotes.findOne({ _id: r.entityId }))!;
    // Quotes are append-only for the application user (P).
    const appQuotes = app.get(MongoService).c.sale_quotes;
    await expect(
      appQuotes.updateOne(
        { _id: q._id },
        { $set: { expiresAt: new Date(q.expiresAt.getTime() + 60000) } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(appQuotes.deleteOne({ _id: q._id })).rejects.toMatchObject({
      code: 13,
    });
    // The validator rejects unbalanced or self-dealing snapshots and an
    // expiry beyond five minutes, even from the privileged migrator (V).
    for (const forged of [
      { buyerTotal: 1 },
      { buyerId: f.seller.id },
      { commission: 0, sellerProceeds: q.buyerTotal },
      { expiresAt: new Date(q.expiresAt.getTime() + 60000) },
    ])
      await expect(
        db.c.sale_quotes.insertOne({ ...q, ...forged, _id: randomUUID() }),
      ).rejects.toMatchObject({ code: 121 });
    expect(await quoteCount({ listingId: f.l.entityId })).toBe(1);
    expect((await quote(f, key).expect(200)).body).toEqual(r);
  });
});
