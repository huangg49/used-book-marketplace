import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import type {
  ListingChannel,
  RoleCode,
} from '../src/database/mongo/documents.js';
import { MediaStorage } from '../src/modules/media/media-storage.js';
import { publicEligibleStages } from '../src/modules/listings/public-listing.service.js';
import { validates } from './helpers/contract.js';
import { CHECKLIST, ListingFixtures } from './helpers/media-listings.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// ADR 0042 over real HTTP and MongoDB (QA replica set, *_test database):
// Auction listings are created by the auction flow, keep their channel and
// never reach marketplace reads or commands. Storage signing is faked.
const storage = {
  async check() {},
  async signedRead(key: string) {
    return {
      url: 'https://storage.test/' + key,
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
  },
};
type Actor = { id: string; token: string; sessionId: string };
const emptyDraft = {
  bookId: null,
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
};

describe('Auction-only listings (ADR 0042)', () => {
  let app: INestApplication, db: MongoFixtures, fixtures: ListingFixtures;
  let reviewer: Actor;

  const call = (method: 'get' | 'post' | 'put', path: string, a?: Actor) => {
    const r = request(app.getHttpServer())[method]('/api/v1' + path);
    return a ? r.set('Authorization', `Bearer ${a.token}`) : r;
  };
  const cmd = (
    method: 'post' | 'put',
    path: string,
    body: object,
    a: Actor,
    key: string = randomUUID(),
  ) => call(method, path, a).set('Idempotency-Key', key).send(body);
  async function actor(roles: RoleCode[] = ['MEMBER']): Promise<Actor> {
    const user = await db.user({ roles });
    const sessionId = await db.session(user._id);
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user._id, sid: sessionId });
    return { id: user._id, token, sessionId };
  }
  // Fixture listing sent for review, then approved through HTTP.
  async function approved(owner: Actor, channel: ListingChannel) {
    const book = await fixtures.book(owner.id, reviewer.id);
    const l = await fixtures.listing(owner.id, book.id, true, channel);
    await cmd(
      'post',
      `/operations/listings/${l.id}/decision`,
      {
        expectedVersion: 2,
        revisionId: l.revision,
        decision: 'Approve',
        checklist: CHECKLIST,
      },
      reviewer,
    ).expect(200);
    const doc = (await db.c.listings.findOne({ _id: l.id }))!;
    return { ...l, version: doc.version };
  }
  const eligible = async (id: string, channel?: ListingChannel) =>
    (
      await db.c.listings
        .aggregate([
          { $match: { _id: id } },
          ...publicEligibleStages(channel),
          { $project: { _id: 1 } },
        ])
        .toArray()
    ).length === 1;

  beforeAll(async () => {
    db = await MongoFixtures.connect();
    fixtures = new ListingFixtures(db);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    reviewer = await actor(['STAFF']);
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('creates an Auction draft, keeps its channel and replays the receipt', async () => {
    const seller = await actor();
    const key = randomUUID();
    const body = {
      channel: 'Auction',
      content: { ...emptyDraft, mode: 'Sale' },
    };
    const created = await cmd('post', '/listings', body, seller, key).expect(
      200,
    );
    const replay = await cmd('post', '/listings', body, seller, key).expect(
      200,
    );
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual(created.body);
    const id = created.body.entityId as string;
    expect(await db.c.listings.findOne({ _id: id })).toMatchObject({
      channel: 'Auction',
      moderation: 'Draft',
    });
    const detail = await call('get', `/me/listings/${id}`, seller).expect(200);
    validates('PrivateListing', detail.body);
    expect(detail.body.channel).toBe('Auction');

    // Saving cannot move it to the marketplace or change its rules.
    await cmd(
      'put',
      `/listings/${id}/draft`,
      { expectedVersion: 1, channel: 'Marketplace', content: emptyDraft },
      seller,
    ).expect(422);
    const exchange = await cmd(
      'put',
      `/listings/${id}/draft`,
      {
        expectedVersion: 1,
        content: { ...emptyDraft, mode: 'Exchange', exchangeValue: 50_000 },
      },
      seller,
    ).expect(422);
    expect(exchange.body.fieldErrors[0].path).toBe('/content/mode');
    await cmd(
      'put',
      `/listings/${id}/draft`,
      {
        expectedVersion: 1,
        content: { ...emptyDraft, mode: 'Sale', salePrice: 120_000 },
      },
      seller,
    ).expect(200);
    expect(await db.c.listings.findOne({ _id: id })).toMatchObject({
      channel: 'Auction',
      version: 2,
    });

    // A plain create still makes a marketplace draft.
    const plain = await cmd(
      'post',
      '/listings',
      { content: emptyDraft },
      seller,
    ).expect(200);
    expect(
      await db.c.listings.findOne({ _id: plain.body.entityId }),
    ).toMatchObject({ channel: 'Marketplace' });
  });

  it('rejects Auction content that is not a Sale without delivery origin', async () => {
    const seller = await actor();
    for (const content of [
      { ...emptyDraft, mode: 'Both' },
      { ...emptyDraft, mode: null, exchangeValue: 50_000 },
      {
        ...emptyDraft,
        fulfillment: {
          method: 'DirectDelivery',
          originAddressId: randomUUID(),
          originAddressVersion: 1,
        },
      },
    ])
      await cmd(
        'post',
        '/listings',
        { channel: 'Auction', content },
        seller,
      ).expect(422);
    expect(await db.c.listings.countDocuments({ ownerId: seller.id })).toBe(0);
  });

  it('filters my listings by channel and returns both without a filter', async () => {
    const seller = await actor();
    const auction = await approved(seller, 'Auction');
    const market = await approved(seller, 'Marketplace');
    const ids = async (query: string) =>
      (await call('get', `/me/listings${query}`, seller).expect(200)).body.items
        .map((i: { id: string }) => i.id)
        .sort();
    expect(await ids('?channel=Auction')).toEqual([auction.id]);
    expect(await ids('?channel=Marketplace')).toEqual([market.id]);
    expect(await ids('')).toEqual([auction.id, market.id].sort());
    await call('get', '/me/listings?channel=Shop', seller).expect(400);
    const page = await call('get', '/me/listings', seller).expect(200);
    validates('PrivateListingPage', page.body);
  });

  it('keeps approved Auction listings out of every marketplace read and command', async () => {
    const seller = await actor();
    const buyer = await actor();
    const auction = await approved(seller, 'Auction');
    const market = await approved(seller, 'Marketplace');
    const own = await approved(buyer, 'Marketplace');

    // Shelf, detail and photo reads; quotes/orders share this predicate.
    expect(await eligible(market.id)).toBe(true);
    expect(await eligible(auction.id)).toBe(false);
    expect(await eligible(auction.id, 'Auction')).toBe(true);
    expect(await eligible(market.id, 'Auction')).toBe(false);
    await call('get', `/listings/${auction.id}`).expect(404);
    await call('get', `/listings/${market.id}`).expect(200);
    await call(
      'get',
      `/listings/${auction.id}/media/${auction.media}/read`,
    ).expect(404);
    const shelf = await call('get', '/listings?limit=50').expect(200);
    expect(JSON.stringify(shelf.body)).not.toContain(auction.id);

    // Commands recheck the channel; nothing is written.
    await cmd(
      'post',
      `/listings/${auction.id}/purchase-conversations`,
      { expectedVersion: auction.version },
      buyer,
    ).expect(409);
    expect(
      await db.c.purchase_conversations.countDocuments({
        listingId: auction.id,
      }),
    ).toBe(0);
    await cmd(
      'put',
      `/me/wishlist/listings/${auction.id}`,
      { wantsToExchange: false, receiveNotifications: true },
      buyer,
    ).expect(404);
    await cmd(
      'post',
      '/exchanges',
      { initiatorListingId: own.id, recipientListingId: auction.id },
      buyer,
    ).expect(409);
    const sellerOffer = await approved(seller, 'Auction');
    await cmd(
      'post',
      '/exchanges',
      { initiatorListingId: sellerOffer.id, recipientListingId: own.id },
      seller,
    ).expect(409);
    expect(
      await db.c.exchanges.countDocuments({
        recipientListingId: { $in: [auction.id, own.id] },
      }),
    ).toBe(0);
    expect(await db.c.listings.findOne({ _id: auction.id })).toMatchObject({
      trade: 'Available',
      version: auction.version,
    });
  });
});
