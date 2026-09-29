import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  applyCollectionSpecs,
  currentCollections,
  migrations,
} from '../src/database/mongo/migrations/index.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';
import { ListingFixtures } from './helpers/media-listings.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// PostgreSQL migration 20260927020000 added the quote tables, CHECKs and the
// HCM-DIRECT-v1 policy to populated fulfillment storage. MongoDB has no such
// upgrade step: the quote collections are in the baseline schema (0001) and
// the policy is reference data (0002, inserted only when absent). This suite
// re-applies those quote parts to populated storage and checks the same
// resulting guarantees: history is not rewritten, the policy/selection are
// seeded exactly, and the guards are each replaced (MIG02_MODEL_MAP) by a
// validator (121), an app-user privilege (13) or the write protocol (W).
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
const QUOTE_COLLECTIONS = [
  'sale_quote_policies',
  'sale_quote_policy_selection',
  'sale_quotes',
];

describe('quote storage on populated fulfillment data (MongoDB)', () => {
  let app: INestApplication, db: MongoFixtures, mongo: MongoService;
  const users: string[] = [];
  const listings: string[] = [];
  const probes = ['QA-BAD-FEE', 'QA-BAD-BPS', 'QA-BAD-TTL0', 'QA-BAD-TTL'];
  let owner: { id: string; token: string };
  const send = (method: 'post' | 'put', path: string, body: object) =>
    request(app.getHttpServer())
      [method]('/api/v1' + path)
      .auth(owner.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send(body);
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
      await db.c.sale_quote_policies.deleteMany({ _id: { $in: probes } });
      await db.c.sale_quote_policy_selection.deleteMany({
        _id: { $ne: 'DirectSale' } as never,
      });
      await new ListingFixtures(db).remove(listings, [], users);
      await db.c.member_addresses.deleteMany({ ownerId: { $in: users } });
      await db.c.address_identities.deleteMany({ ownerId: { $in: users } });
      await db.c.address_books.deleteMany({ _id: { $in: users } });
      await db.removeUsers(users);
      await db.close();
    }
    await app?.close();
  });

  it('adds quotes to populated fulfillment storage without rewriting history or weakening existing guards', async () => {
    // Populated fulfillment storage: an address and a listing whose revision
    // uses it as origin, with their receipts and audit events.
    const addressId = (
      await send('post', '/me/addresses', {
        expectedBookVersion: 0,
        address,
        makeDefault: false,
      }).expect(200)
    ).body.addressId as string;
    const created = await send('post', '/listings', {
      content: empty,
    }).expect(200);
    const listingId = created.body.entityId as string;
    listings.push(listingId);
    await send('put', `/listings/${listingId}/draft`, {
      expectedVersion: 1,
      content: {
        ...empty,
        fulfillment: {
          originAddressId: addressId,
          originAddressVersion: 1,
          method: 'DirectDelivery',
        },
      },
    }).expect(200);

    const snapshot = async () => ({
      member_addresses: await db.c.member_addresses
        .find({ ownerId: owner.id })
        .toArray(),
      address_identities: await db.c.address_identities
        .find({ ownerId: owner.id })
        .toArray(),
      listing_revisions: await db.c.listing_revisions
        .find({ listingId })
        .toArray(),
      listings: await db.c.listings.find({ _id: listingId }).toArray(),
      mutation_receipts: await db.c.mutation_receipts
        .find({ actorId: owner.id })
        .toArray(),
      audit_events: await db.c.audit_events
        .find({ actorId: owner.id })
        .toArray(),
    });
    const before = await snapshot();
    expect(before.mutation_receipts).toHaveLength(3);
    expect(before.audit_events).toHaveLength(3);
    // Re-apply the quote schema (0001) and quote reference data (0002), as
    // the migrator, to the populated database.
    await applyCollectionSpecs(
      db.client.db(),
      currentCollections().filter((s) => QUOTE_COLLECTIONS.includes(s.name)),
    );
    await migrations
      .find((m) => m.id === '0002-reference-data')!
      .up(db.client.db(), db.client);
    expect(await snapshot()).toEqual(before);
    // The quote target the SQL migration added is an explicit null on history.
    for (const row of [...before.mutation_receipts, ...before.audit_events])
      expect(row.quoteId).toBeNull();
    expect(
      await db.c.sale_quotes.countDocuments({
        $or: [{ sellerId: owner.id }, { buyerId: owner.id }, { listingId }],
      }),
    ).toBe(0);
    expect(await db.c.sale_quote_policies.find({}).toArray()).toEqual([
      {
        _id: 'HCM-DIRECT-v1',
        shippingFee: 30000,
        commissionBps: 500,
        ttlSeconds: 300,
      },
    ]);
    expect(await db.c.sale_quote_policy_selection.find({}).toArray()).toEqual([
      { _id: 'DirectSale', policyCode: 'HCM-DIRECT-v1' },
    ]);

    // Listing versions only advance through a write naming the current
    // version (W, formerly latlai_guard_aggregate).
    await send('put', `/listings/${listingId}/draft`, {
      expectedVersion: 99,
      content: empty,
    }).expect(409);
    expect((await db.c.listings.findOne({ _id: listingId }))!.version).toBe(2);
    // Address content versions start at 1 (V) and advance by exactly one on a
    // content change (W, formerly latlai_address_content_version).
    await expect(
      mongo.c.member_addresses.updateOne(
        { _id: addressId },
        { $set: { version: 0 } },
      ),
    ).rejects.toMatchObject({ code: 121 });
    await send('put', `/me/addresses/${addressId}`, {
      expectedBookVersion: 1,
      address: { ...address, detail: 'Changed test address only' },
      makeDefault: false,
    }).expect(200);
    expect(
      (await db.c.member_addresses.findOne({ _id: addressId }))!.version,
    ).toBe(2);
    // Receipts are append-only for the application user (P).
    const receipt = before.mutation_receipts[0];
    await expect(
      mongo.c.mutation_receipts.deleteOne({ _id: receipt._id }),
    ).rejects.toMatchObject({ code: 13 });
    // The receipt target rule still rejects an ambiguous target (V).
    await expect(
      mongo.c.mutation_receipts.insertOne({
        ...receipt,
        _id: randomUUID(),
        key: randomUUID(),
        listingId,
        addressBookId: owner.id,
      }),
    ).rejects.toMatchObject({ code: 121 });

    // Quote storage guards added by the quote migration.
    // Quotes are append-only and policy/selection rows are read-only for the
    // application user (P, formerly latlai_append_only).
    await expect(
      mongo.c.sale_quotes.updateOne(
        { listingId },
        { $set: { shippingFee: 0 } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.sale_quotes.deleteMany({ listingId }),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.sale_quote_policies.updateOne(
        { _id: 'HCM-DIRECT-v1' },
        { $set: { shippingFee: 0 } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.sale_quote_policies.deleteOne({ _id: 'HCM-DIRECT-v1' }),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.sale_quote_policies.insertOne({
        _id: 'QA-APP-POLICY',
        shippingFee: 0,
        commissionBps: 0,
        ttlSeconds: 300,
      }),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.sale_quote_policy_selection.updateOne(
        { _id: 'DirectSale' },
        { $set: { policyCode: 'QA-APP-POLICY' } },
      ),
    ).rejects.toMatchObject({ code: 13 });
    // Policy ranges and the selection scope hold even for the migrator (V).
    for (const [id, patch] of [
      ['QA-BAD-FEE', { shippingFee: 1_000_001 }],
      ['QA-BAD-BPS', { commissionBps: 10_001 }],
      ['QA-BAD-TTL0', { ttlSeconds: 0 }],
      ['QA-BAD-TTL', { ttlSeconds: 301 }],
    ] as const)
      await expect(
        db.c.sale_quote_policies.insertOne({
          _id: id,
          shippingFee: 30000,
          commissionBps: 500,
          ttlSeconds: 300,
          ...patch,
        }),
      ).rejects.toMatchObject({ code: 121 });
    await expect(
      db.c.sale_quote_policy_selection.insertOne({
        _id: 'OtherScope',
        policyCode: 'QA-UNUSED',
      }),
    ).rejects.toMatchObject({ code: 121 });
    expect(await db.c.sale_quote_policies.countDocuments()).toBe(1);
    expect(await db.c.sale_quote_policy_selection.countDocuments()).toBe(1);
  });
});
