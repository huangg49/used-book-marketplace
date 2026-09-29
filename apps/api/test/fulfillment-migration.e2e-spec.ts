import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { validates } from './helpers/contract.js';
import { failsCommitCheck, ListingFixtures } from './helpers/media-listings.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// PostgreSQL migration 20260927010000 backfilled address identities/versions
// for existing rows, left existing listing revisions without an origin and
// kept the address/listing guards. MongoDB has no such upgrade (the baseline
// already contains the fulfillment model), so this suite checks the same
// resulting guarantees: identities are written with every address, revisions
// without an origin stay valid and unassigned, and the guards still hold.
const address = {
  recipientName: 'Fixture',
  phone: '0900000000',
  serviceAreaCode: 'HCM-DEMO-v1',
  localityCode: 'DEMO-A',
  detail: 'Test address only',
};
const empty = {
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

describe('listing fulfillment origin and address identity on MongoDB', () => {
  let app: INestApplication, db: MongoFixtures, mongo: MongoService;
  const users: string[] = [];
  const listings: string[] = [];
  let owner: { id: string; token: string };
  const send = (method: 'post' | 'put', path: string, body: object) =>
    request(app.getHttpServer())
      [method]('/api/v1' + path)
      .auth(owner.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send(body);
  const detail = async (id: string) => {
    const r = await request(app.getHttpServer())
      .get(`/api/v1/me/listings/${id}`)
      .auth(owner.token, { type: 'bearer' })
      .expect(200);
    validates('PrivateListing', r.body);
    return r.body;
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
    mongo = app.get(MongoService);
    db = await MongoFixtures.connect();
    const user = await db.user({ displayName: 'Upgrade fixture' });
    users.push(user._id);
    const sid = await db.session(user._id);
    owner = {
      id: user._id,
      token: await app.get(JwtService).signAsync({ sub: user._id, sid }),
    };
  }, 60000);
  afterAll(async () => {
    if (db) {
      await new ListingFixtures(db).remove(listings, [], users);
      await db.c.member_addresses.deleteMany({ ownerId: { $in: users } });
      await db.c.address_identities.deleteMany({ ownerId: { $in: users } });
      await db.c.address_books.deleteMany({ _id: { $in: users } });
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
  });

  it('keeps addresses identified, listings without origin unassigned and the address/listing guards', async () => {
    const saved = await send('post', '/me/addresses', {
      expectedBookVersion: 0,
      address,
      makeDefault: false,
    }).expect(200);
    const addressId = saved.body.addressId as string;
    // Identity and content version exist from the first write (the former backfill).
    expect(
      await db.c.member_addresses.findOne({ _id: addressId }),
    ).toMatchObject({ ownerId: owner.id, version: 1, isDefault: true });
    expect(await db.c.address_identities.findOne({ _id: addressId })).toEqual({
      _id: addressId,
      ownerId: owner.id,
    });

    // A revision saved without fulfillment keeps no origin, as legacy rows did.
    const created = await send('post', '/listings', { content: empty }).expect(
      200,
    );
    const listingId = created.body.entityId as string,
      revisionId = created.body.revisionId as string;
    listings.push(listingId);
    const origin = (id: string) =>
      db.c.listing_revisions.findOne(
        { _id: id },
        {
          projection: {
            _id: 0,
            originAddressId: 1,
            originAddressVersion: 1,
            originServiceAreaCode: 1,
          },
        },
      );
    expect(await origin(revisionId)).toEqual({
      originAddressId: null,
      originAddressVersion: null,
      originServiceAreaCode: null,
    });
    let listing = await detail(listingId);
    expect(listing.currentRevision.fulfillmentStatus).toBe('NotConfigured');
    expect(listing.currentRevision.content).not.toHaveProperty('fulfillment');

    // An origin is assigned only by choosing it; an upper-case id is the same address.
    await send('put', `/listings/${listingId}/draft`, {
      expectedVersion: 1,
      content: {
        ...empty,
        fulfillment: {
          originAddressId: addressId.toUpperCase(),
          originAddressVersion: 1,
          method: 'DirectDelivery',
        },
      },
    }).expect(200);
    expect(await origin(revisionId)).toEqual({
      originAddressId: addressId,
      originAddressVersion: 1,
      originServiceAreaCode: 'HCM-DEMO-v1',
    });
    listing = await detail(listingId);
    expect(listing.currentRevision.fulfillmentStatus).toBe('Current');
    expect(listing.currentRevision.content.fulfillment).toEqual({
      originAddressId: addressId,
      originAddressVersion: 1,
      method: 'DirectDelivery',
    });

    // Guards. Identities are append-only for the application user (P).
    await expect(
      mongo.c.address_identities.updateOne(
        { _id: addressId },
        { $set: { ownerId: randomUUID() } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    // A partial origin is rejected by the validator (V).
    await expect(
      mongo.c.listing_revisions.updateOne(
        { _id: revisionId },
        { $set: { originServiceAreaCode: null } },
      ),
    ).rejects.toMatchObject({ code: 121 });
    // Clearing the sole default is a commit-time invariant (C): a raw write
    // lands, and the next address command fails instead of compounding it.
    await mongo.c.member_addresses.updateOne(
      { _id: addressId },
      { $set: { isDefault: false } },
    );
    await failsCommitCheck(
      () =>
        send('post', '/me/addresses', {
          expectedBookVersion: 1,
          address,
          makeDefault: false,
        }),
      'Address quota or default invariant',
    );
    expect(
      await db.c.member_addresses.countDocuments({ ownerId: owner.id }),
    ).toBe(1);
    await db.c.member_addresses.updateOne(
      { _id: addressId },
      { $set: { isDefault: true } },
    );
    // Listing versions only advance by one through a write naming the current
    // version (W); an arbitrary version is a conflict.
    await send('put', `/listings/${listingId}/draft`, {
      expectedVersion: 99,
      content: empty,
    }).expect(409);
    expect((await db.c.listings.findOne({ _id: listingId }))!.version).toBe(2);
    const next = await send('put', `/listings/${listingId}/draft`, {
      expectedVersion: 2,
      content: empty,
    }).expect(200);
    expect(next.body.version).toBe(3);
  });
});
