import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { TransactionPolicy } from '../src/modules/wallet/transaction-policy.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { PurchasesService } from '../src/modules/purchases/purchases.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

type Reader = { id: string; token: string };
describe('Unified conversation agreements / isolated Mongo HTTP', () => {
  let app: INestApplication, db: MongoFixtures, admin: Reader;
  const get = (path: string, who: Reader) =>
    request(app.getHttpServer())
      .get('/api/v1' + path)
      .set('Authorization', `Bearer ${who.token}`);
  const post = (path: string, body: object, who: Reader, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('Authorization', `Bearer ${who.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const reader = async (
    roles: ('MEMBER' | 'ADMIN')[] = ['MEMBER'],
  ): Promise<Reader> => {
    const user = await db.user({ roles });
    const sid = await db.session(user._id);
    return {
      id: user._id,
      token: await app.get(JwtService).signAsync({ sub: user._id, sid }),
    };
  };
  async function listing(seller: Reader, mode = 'Both') {
    const cat = (
      await post(
        '/catalog/requests',
        {
          metadata: {
            title: 'QA agreement ' + randomUUID(),
            authors: ['QA'],
            publisher: null,
            publicationYear: null,
            language: 'vi',
            edition: null,
            category: 'Văn học',
            isbn: null,
          },
        },
        seller,
      ).expect(200)
    ).body;
    await post(
      `/operations/catalog-requests/${cat.entityId}/decision`,
      {
        expectedVersion: cat.version,
        revisionId: cat.revisionId,
        decision: 'Confirm',
      },
      admin,
    ).expect(200);
    const content = {
      bookId: cat.entityId,
      mode,
      condition: 'Good',
      pages: 'Đủ trang',
      coverNote: 'Bìa mô phỏng',
      notes: 'Dữ liệu QA',
      accessories: 'Không có',
      description: 'Dữ liệu QA riêng biệt, không phải bài đăng sách thật.',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      salePrice: mode === 'Exchange' ? null : 100000,
      exchangeValue: mode === 'Sale' ? null : 100000,
      mediaIds: [] as string[],
    };
    const draft = (await post('/listings', { content }, seller).expect(200))
      .body;
    const now = new Date(),
      mediaId = randomUUID(),
      storageKey = randomUUID();
    await db.c.listing_media.insertOne({
      _id: mediaId,
      listingId: draft.entityId,
      version: 1,
      status: 'Ready',
      stagingKey: storageKey,
      pinnedKey: storageKey + '/input',
      derivativeKey: storageKey + '/display.webp',
      mimeType: 'image/jpeg',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      width: 20,
      height: 20,
      failureCode: null,
      expiresAt: new Date(Date.now() + 3600000),
      purgedAt: null,
      reservedBytes: 1000,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    const address = await saveAddress(seller),
      updated = {
        ...content,
        mediaIds: [mediaId],
        fulfillment: {
          originAddressId: address.id,
          originAddressVersion: address.version,
          method: 'DirectDelivery',
        },
      };
    const saved = (
      await request(app.getHttpServer())
        .put(`/api/v1/listings/${draft.entityId}/draft`)
        .set('Authorization', `Bearer ${seller.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: draft.version, content: updated })
        .expect(200)
    ).body;
    const sent = (
      await post(
        `/listings/${draft.entityId}/submit`,
        { expectedVersion: saved.version, ownershipDeclared: true },
        seller,
      ).expect(200)
    ).body;
    const approved = (
      await post(
        `/operations/listings/${draft.entityId}/decision`,
        {
          expectedVersion: sent.version,
          revisionId: sent.revisionId,
          decision: 'Approve',
          checklist: {
            catalogMatches: true,
            photosClear: true,
            conditionDisclosed: true,
            readable: true,
            pricingValid: true,
            contentAppropriate: true,
          },
        },
        admin,
      ).expect(200)
    ).body;
    return {
      id: draft.entityId as string,
      version: approved.version as number,
      revisionId: approved.revisionId as string,
    };
  }
  async function saveAddress(who: Reader) {
    const book = (await get('/me/addresses', who).expect(200)).body;
    if (book.items.length) return book.items[0];
    const added = (
      await post(
        '/me/addresses',
        {
          expectedBookVersion: book.version,
          makeDefault: true,
          address: {
            recipientName: 'QA demo',
            phone: '0900000000',
            detail: 'Địa chỉ mô phỏng QA, không giao hàng thật',
            serviceAreaCode: 'HCM-DEMO-v1',
            localityCode: 'DEMO-A',
          },
        },
        who,
      ).expect(200)
    ).body;
    return (await get('/me/addresses', who).expect(200)).body.items.find(
      (a: { id: string }) => a.id === added.addressId,
    );
  }
  async function setup(mode = 'Both', intent = 'Negotiation') {
    const seller = await reader(),
      buyer = await reader(),
      book = await listing(seller, mode);
    const created = (
      await post(
        `/listings/${book.id}/purchase-conversations`,
        { expectedVersion: book.version, intent },
        buyer,
      ).expect(200)
    ).body;
    return { seller, buyer, book, id: created.entityId as string };
  }
  const room = async (id: string, who: Reader) =>
    (await get(`/me/purchase-conversations/${id}`, who).expect(200)).body;
  async function price(f: Awaited<ReturnType<typeof setup>>, amount = 80000) {
    let current = await room(f.id, f.buyer);
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      { expectedVersion: current.version, kind: 'Price', amount },
      f.buyer,
    ).expect(200);
    current = await room(f.id, f.seller);
    return post(
      `/me/purchase-conversations/${f.id}/terms/respond`,
      {
        expectedVersion: current.version,
        proposalId: current.terms.pendingProposal.id,
        accept: true,
      },
      f.seller,
    ).expect(200);
  }
  async function attachQuote(f: Awaited<ReturnType<typeof setup>>) {
    const address = await saveAddress(f.buyer);
    const quote = (
      await post(
        `/listings/${f.book.id}/quotes`,
        {
          expectedListingVersion: f.book.version,
          expectedListingRevisionId: f.book.revisionId,
          destinationAddressId: address.id,
          expectedDestinationAddressVersion: address.version,
          method: 'DirectDelivery',
        },
        f.buyer,
      ).expect(200)
    ).body;
    const current = await room(f.id, f.buyer);
    await post(
      `/me/purchase-conversations/${f.id}/quote`,
      {
        expectedVersion: current.version,
        quoteId: quote.entityId,
        expectedQuoteVersion: quote.version,
        expectedListingVersion: f.book.version,
        expectedListingRevisionId: f.book.revisionId,
      },
      f.buyer,
    ).expect(200);
  }
  beforeAll(async () => {
    db = await MongoFixtures.connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TransactionPolicy)
      .useValue({ listingFee: 0, atomicCheckout: false })
      .overrideProvider(MediaStorage)
      .useValue({
        async check() {},
        async signedRead() {
          return {
            url: 'https://storage.test/qa.webp',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          };
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    admin = await reader(['MEMBER', 'ADMIN']);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('keeps buyer/listing rooms private and requires seller confirmation of an initial exchange intent', async () => {
    const f = await setup('Both', 'Exchange'),
      outsider = await reader();
    const second = (
      await post(
        `/listings/${f.book.id}/purchase-conversations`,
        { expectedVersion: f.book.version, intent: 'Negotiation' },
        outsider,
      ).expect(200)
    ).body;
    expect(second.entityId).not.toBe(f.id);
    await get(`/me/purchase-conversations/${f.id}`, outsider).expect(404);
    await get(`/me/purchase-conversations/${f.id}/events`, outsider).expect(
      404,
    );
    const current = await room(f.id, f.buyer),
      body = {
        expectedVersion: current.version,
        proposalId: current.terms.pendingProposal.id,
        accept: true,
      };
    await post(
      `/me/purchase-conversations/${f.id}/terms/respond`,
      body,
      f.buyer,
    ).expect(403);
    await post(
      `/me/purchase-conversations/${f.id}/terms/respond`,
      body,
      f.seller,
    ).expect(200);
    expect((await room(f.id, f.buyer)).terms.mode).toBe('Exchange');
    expect((await db.c.listings.findOne({ _id: f.book.id }))!.trade).toBe(
      'Available',
    );
    expect((await room(second.entityId, outsider)).terms.mode).toBe(
      'Negotiation',
    );
  });
  it('validates price, rejects self-accept/stale revision and replays one accepted offer without duplicate events', async () => {
    const f = await setup(),
      current = await room(f.id, f.buyer),
      key = randomUUID();
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      { expectedVersion: current.version, kind: 'Price', amount: 9999 },
      f.buyer,
    ).expect(422);
    const body = {
      expectedVersion: current.version,
      kind: 'Price',
      amount: 80000,
    };
    const proposed = (
      await post(
        `/me/purchase-conversations/${f.id}/terms`,
        body,
        f.buyer,
        key,
      ).expect(200)
    ).body;
    expect(
      (
        await post(
          `/me/purchase-conversations/${f.id}/terms`,
          body,
          f.buyer,
          key,
        ).expect(200)
      ).body.id,
    ).toBe(proposed.id);
    const next = await room(f.id, f.seller),
      response = {
        expectedVersion: next.version,
        proposalId: next.terms.pendingProposal.id,
        accept: true,
      };
    await post(
      `/me/purchase-conversations/${f.id}/terms/respond`,
      response,
      f.buyer,
    ).expect(403);
    await post(
      `/me/purchase-conversations/${f.id}/terms/respond`,
      { ...response, expectedVersion: current.version },
      f.seller,
    ).expect(409);
    const acceptKey = randomUUID(),
      accepted = (
        await post(
          `/me/purchase-conversations/${f.id}/terms/respond`,
          response,
          f.seller,
          acceptKey,
        ).expect(200)
      ).body;
    expect(
      (
        await post(
          `/me/purchase-conversations/${f.id}/terms/respond`,
          response,
          f.seller,
          acceptKey,
        ).expect(200)
      ).body.id,
    ).toBe(accepted.id);
    expect((await room(f.id, f.buyer)).terms.agreedPrice).toBe(80000);
    expect(
      await db.c.conversation_events.countDocuments({ conversationId: f.id }),
    ).toBe(2);
  });
  it('restricts the mode switch to the seller and respects Sale-only listings', async () => {
    const f = await setup(),
      current = await room(f.id, f.buyer);
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      { expectedVersion: current.version, kind: 'Mode', mode: 'Exchange' },
      f.buyer,
    ).expect(403);
    const sale = await setup('Sale'),
      value = await room(sale.id, sale.seller);
    await post(
      `/me/purchase-conversations/${sale.id}/terms`,
      { expectedVersion: value.version, kind: 'Mode', mode: 'Exchange' },
      sale.seller,
    ).expect(409);
    await post(
      `/listings/${sale.book.id}/purchase-conversations`,
      { expectedVersion: sale.book.version, intent: 'Exchange' },
      await reader(),
    ).expect(409);
    const ex = await setup('Exchange', 'Exchange');
    expect((await room(ex.id, ex.buyer)).terms.mode).toBe('Exchange');
    await post(
      `/listings/${ex.book.id}/purchase-conversations`,
      { expectedVersion: ex.book.version, intent: 'Negotiation' },
      await reader(),
    ).expect(409);
  });
  it('freezes the accepted price into the order and keeps participant chat available afterwards', async () => {
    const f = await setup();
    await attachQuote(f);
    let current = await room(f.id, f.seller);
    await post(
      '/orders',
      {
        conversationId: f.id,
        expectedVersion: current.version,
        agreedBookPrice: 80000,
      },
      f.seller,
    ).expect(409);
    await price(f);
    current = await room(f.id, f.seller);
    await post(
      '/orders',
      {
        conversationId: f.id,
        expectedVersion: current.version,
        agreedBookPrice: 75000,
      },
      f.seller,
    ).expect(409);
    const order = (
      await post(
        '/orders',
        {
          conversationId: f.id,
          expectedVersion: current.version,
          agreedBookPrice: 80000,
        },
        f.seller,
      ).expect(200)
    ).body;
    current = await room(f.id, f.buyer);
    expect(current.orderId).toBe(order.entityId);
    expect(current.terms.locked).toBe(true);
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      { expectedVersion: current.version, kind: 'Price', amount: 85000 },
      f.seller,
    ).expect(409);
    const actor = await app.get(AuthService).authenticate(f.buyer.token),
      messageId = randomUUID();
    const sent = await app
      .get(PurchasesService)
      .send(actor, {
        messageId,
        conversationId: f.id,
        body: 'Bạn đóng gói giúp mình nhé.',
      });
    expect(sent.id).toBe(messageId);
    expect(
      (
        await get(
          `/me/purchase-conversations/${f.id}/messages`,
          f.seller,
        ).expect(200)
      ).body,
    ).toHaveLength(1);
  });
  it('mode changes and order creation compete atomically; only one intent succeeds', async () => {
    const f = await setup();
    await attachQuote(f);
    await price(f);
    const current = await room(f.id, f.seller);
    const results = await Promise.all([
      post(
        '/orders',
        {
          conversationId: f.id,
          expectedVersion: current.version,
          agreedBookPrice: 80000,
        },
        f.seller,
      ),
      post(
        `/me/purchase-conversations/${f.id}/terms`,
        { expectedVersion: current.version, kind: 'Mode', mode: 'Exchange' },
        f.seller,
      ),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
    const after = await room(f.id, f.seller);
    expect((await db.c.listings.findOne({ _id: f.book.id }))!.trade).toBe(
      after.orderId ? 'Reserved' : 'Available',
    );
  });
  it('links an exchange once without holding books and refuses mode changes while its proposal exists', async () => {
    const f = await setup('Both', 'Exchange');
    let current = await room(f.id, f.seller);
    await post(
      `/me/purchase-conversations/${f.id}/terms/respond`,
      {
        expectedVersion: current.version,
        proposalId: current.terms.pendingProposal.id,
        accept: true,
      },
      f.seller,
    ).expect(200);
    const own = await listing(f.buyer),
      address = await saveAddress(f.buyer);
    current = await room(f.id, f.buyer);
    const body = {
        conversationId: f.id,
        expectedConversationVersion: current.version,
        initiatorListingIds: [own.id],
        recipientListingId: f.book.id,
        deliveryAddressId: address.id,
      },
      key = randomUUID();
    const created = (await post('/exchanges', body, f.buyer, key).expect(201))
      .body;
    expect(
      (await post('/exchanges', body, f.buyer, key).expect(201)).body.id,
    ).toBe(created.id);
    current = await room(f.id, f.seller);
    expect(current.terms.activeExchangeId).toBe(created.id);
    expect(current.terms.exchangeIds).toEqual([created.id]);
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      { expectedVersion: current.version, kind: 'Mode', mode: 'Negotiation' },
      f.seller,
    ).expect(409);
    expect(
      await db.c.conversation_exchange_links.countDocuments({
        conversationId: f.id,
      }),
    ).toBe(1);
    expect((await db.c.listings.findOne({ _id: own.id }))!.trade).toBe(
      'Available',
    );
    expect((await db.c.listings.findOne({ _id: f.book.id }))!.trade).toBe(
      'Available',
    );
  });
  it('does not accept proposals on behalf of another buyer or reuse revoked sessions for replay', async () => {
    const f = await setup(),
      outsider = await reader(),
      current = await room(f.id, f.buyer),
      key = randomUUID();
    const body = {
      expectedVersion: current.version,
      kind: 'Price',
      amount: 90000,
    };
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      body,
      outsider,
    ).expect(404);
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      body,
      f.buyer,
      key,
    ).expect(200);
    await db.c.auth_sessions.updateMany(
      { userId: f.buyer.id },
      { $set: { revokedAt: new Date() } },
    );
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      body,
      f.buyer,
      key,
    ).expect(401);
  });
  it('rejects malformed price/revision pairs at the Mongo validator and allows withdrawing an unaccepted proposal', async () => {
    const f = await setup(),
      current = await room(f.id, f.buyer);
    await expect(
      db.c.conversation_terms.updateOne(
        { _id: f.id },
        { $set: { agreedPrice: 50000, agreedListingRevisionId: null } },
      ),
    ).rejects.toMatchObject({ code: 121 });
    await post(
      `/me/purchase-conversations/${f.id}/terms`,
      { expectedVersion: current.version, kind: 'Price', amount: 85000 },
      f.buyer,
    ).expect(200);
    const pending = await room(f.id, f.buyer);
    await post(
      `/me/purchase-conversations/${f.id}/terms/respond`,
      {
        expectedVersion: pending.version,
        proposalId: pending.terms.pendingProposal.id,
        accept: false,
      },
      f.buyer,
    ).expect(200);
    expect((await room(f.id, f.buyer)).terms.pendingProposal).toBeNull();
  });
  it('closes new negotiations when another buyer reserves the book, without blocking messages', async () => {
    const f = await setup(),
      other = await reader();
    await attachQuote(f);
    await price(f);
    const second = (
      await post(
        `/listings/${f.book.id}/purchase-conversations`,
        { expectedVersion: f.book.version, intent: 'Negotiation' },
        other,
      ).expect(200)
    ).body;
    const current = await room(f.id, f.seller);
    await post(
      '/orders',
      {
        conversationId: f.id,
        expectedVersion: current.version,
        agreedBookPrice: 80000,
      },
      f.seller,
    ).expect(200);
    expect((await room(second.entityId, other)).terms.locked).toBe(true);
    const actor = await app.get(AuthService).authenticate(other.token);
    await expect(
      app
        .get(PurchasesService)
        .send(actor, {
          messageId: randomUUID(),
          conversationId: second.entityId,
          body: 'Mình chờ nếu sách còn lại nhé.',
        }),
    ).resolves.toHaveProperty('conversationId', second.entityId);
  });
});
