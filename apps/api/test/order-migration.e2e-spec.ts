import { randomUUID } from 'node:crypto';
import {
  applyCollectionSpecs,
  currentCollections,
} from '../src/database/mongo/migrations/index.js';
import { checkIntegrity } from '../src/integrity/integrity.js';
import { checkListing } from '../src/modules/listings/listing-projection.js';
import {
  orderUpgradeDatabase,
  populateFulfillment,
  snapshot,
  emptyContent,
  upgradeAddress,
} from './helpers/order-migration-db.js';

// PostgreSQL migration 20260927030000 added the order/workflow/commitment
// tables to populated quote storage and refused to run while legacy
// `Reserved` placeholder listings existed. MongoDB has no such upgrade step:
// the order collections are in the baseline schema (0001). The equivalents
// checked here, on a dedicated freshly migrated database holding populated
// history:
// - the "fail closed on legacy Reserved placeholders" gate is the whole-db
//   integrity sweep the importer (MIG-06) runs before opening traffic
//   (checkIntegrity): it reports exactly that listing and changes nothing,
//   and an application write producing one is aborted at commit (C);
// - re-applying the order collection specs to populated storage rewrites no
//   history, and the earlier guards still hold: W (listing version), V/W
//   (address version), P (append-only receipts, no deletes on order
//   aggregates), V (one receipt target).
const ORDER_COLLECTIONS = [
  'direct_orders',
  'workflow_contexts',
  'workflow_items',
  'agreement_snapshots',
  'exclusive_commitments',
  'commitment_events',
  'mutation_receipts',
  'audit_events',
];
const HISTORY = [
  'users',
  'address_books',
  'member_addresses',
  'address_identities',
  'listing_revisions',
  'listings',
  'mutation_receipts',
  'audit_events',
  'outbox_events',
];

describe('order storage on populated quote data (MongoDB)', () => {
  let x: Awaited<ReturnType<typeof orderUpgradeDatabase>>;
  beforeAll(async () => {
    x = await orderUpgradeDatabase('order');
  }, 60000);
  afterAll(async () => {
    await x?.close();
  });

  it('upgrades populated quote storage, rejects legacy Reserved placeholders and preserves history', async () => {
    const { db, rootDb, mongo, owner, send } = x;
    const { addressId, listingId } = await populateFulfillment(send);
    const sweep = () => mongo.tx((tx) => checkIntegrity(tx, 1000));
    expect((await sweep()).failures).toEqual([]);

    // A legacy Reserved placeholder (no commitment), written by a privileged
    // writer that bypassed the executor.
    await db.c.listings.updateOne(
      { _id: listingId },
      { $set: { trade: 'Reserved' }, $inc: { version: 1, lockSeq: 1 } },
    );
    const refused = await sweep();
    expect(refused.failures).toEqual([
      {
        aggregate: 'listing',
        id: listingId,
        error: 'Listing/commitment projection mismatch',
      },
    ]);
    // Fail closed: ownership is never inferred and nothing is released or
    // created for the placeholder.
    for (const name of [
      'direct_orders',
      'workflow_contexts',
      'workflow_items',
      'agreement_snapshots',
      'exclusive_commitments',
      'commitment_events',
    ])
      expect(await rootDb.collection(name).countDocuments()).toBe(0);
    expect((await db.c.listings.findOne({ _id: listingId }))!.trade).toBe(
      'Reserved',
    );
    await db.c.listings.updateOne(
      { _id: listingId },
      { $set: { trade: 'Available' }, $inc: { version: 1, lockSeq: 1 } },
    );

    const before = await snapshot(rootDb, HISTORY);
    expect(before.mutation_receipts).toHaveLength(3);
    expect(before.audit_events).toHaveLength(3);
    // Re-apply the order schema (0001), as the migrator, to populated storage.
    await applyCollectionSpecs(
      db.client.db(),
      currentCollections().filter((s) => ORDER_COLLECTIONS.includes(s.name)),
    );
    expect(await snapshot(rootDb, HISTORY)).toEqual(before);
    // The context/system-actor columns the SQL migration added are explicit
    // nulls on existing history.
    for (const row of [
      ...(before.mutation_receipts as { contextId: unknown }[]),
      ...(before.audit_events as { contextId: unknown }[]),
    ])
      expect(row).toMatchObject({ contextId: null, systemActor: null });
    expect((await sweep()).failures).toEqual([]);
    expect(await rootDb.collection('sale_quotes').countDocuments()).toBe(0);
    expect(await db.c.sale_quote_policies.find({}).toArray()).toEqual([
      {
        _id: 'HCM-DIRECT-v1',
        shippingFee: 30000,
        commissionBps: 500,
        ttlSeconds: 300,
      },
    ]);

    // Reserved without an active commitment: commit-time check (C) aborts
    // the application transaction that attempts it.
    await expect(
      mongo.tx(async (tx) => {
        await tx.c.listings.updateOne(
          { _id: listingId },
          { $set: { trade: 'Reserved' }, $inc: { version: 1, lockSeq: 1 } },
        );
        await checkListing(tx, listingId);
      }),
    ).rejects.toThrow('Listing/commitment projection mismatch');
    const listing = (await db.c.listings.findOne({ _id: listingId }))!;
    expect(listing.trade).toBe('Available');
    // Listing versions only advance through a write naming the current
    // version (W, formerly latlai_guard_aggregate).
    await send('put', `/listings/${listingId}/draft`, {
      expectedVersion: 99,
      content: emptyContent,
    }).expect(409);
    expect((await db.c.listings.findOne({ _id: listingId }))!.version).toBe(
      listing.version,
    );
    // Address content versions start at 1 (V) and advance by exactly one on
    // a content change (W, formerly latlai_address_content_version).
    await expect(
      mongo.c.member_addresses.updateOne(
        { _id: addressId },
        { $set: { version: 0 } },
      ),
    ).rejects.toMatchObject({ code: 121 });
    await send('put', `/me/addresses/${addressId}`, {
      expectedBookVersion: 1,
      address: { ...upgradeAddress, detail: 'Changed test address only' },
      makeDefault: false,
    }).expect(200);
    expect(
      (await db.c.member_addresses.findOne({ _id: addressId }))!.version,
    ).toBe(2);
    // Receipts are append-only for the application user (P).
    const receipt = (before.mutation_receipts as Record<string, unknown>[])[0];
    await expect(
      mongo.c.mutation_receipts.deleteOne({ _id: receipt._id as string }),
    ).rejects.toMatchObject({ code: 13 });
    // The expanded target rule still rejects an ambiguous target (V).
    await expect(
      mongo.c.mutation_receipts.insertOne({
        ...receipt,
        _id: randomUUID(),
        key: randomUUID(),
        listingId,
        addressBookId: owner,
      } as never),
    ).rejects.toMatchObject({ code: 121 });
    // Guards the migration added: no deletes of orders/contexts/commitments
    // and immutable items/snapshots/commitment events (P).
    for (const name of [
      'direct_orders',
      'workflow_contexts',
      'exclusive_commitments',
    ] as const)
      await expect(
        mongo.c[name].deleteMany({ _id: randomUUID() }),
      ).rejects.toMatchObject({ code: 13 });
    for (const name of [
      'workflow_items',
      'agreement_snapshots',
      'commitment_events',
    ] as const) {
      await expect(
        mongo.db
          .collection(name)
          .updateMany({}, { $set: { createdAt: new Date() } }),
      ).rejects.toMatchObject({ code: 13 });
      await expect(
        mongo.db.collection(name).deleteMany({}),
      ).rejects.toMatchObject({ code: 13 });
    }
  });
});
