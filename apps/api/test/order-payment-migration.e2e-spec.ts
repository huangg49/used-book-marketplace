import { randomUUID } from 'node:crypto';
import {
  applyCollectionSpecs,
  currentCollections,
  migrations,
} from '../src/database/mongo/migrations/index.js';
import {
  CAPITAL_ACCOUNT_ID,
  LEDGER_SEQUENCE_COUNTER,
  OPENING_JOURNAL_ID,
} from '../src/database/mongo/migrations/0002-reference-data.js';
import { checkIntegrity } from '../src/integrity/integrity.js';
import { checkListing } from '../src/modules/listings/listing-projection.js';
import {
  orderUpgradeDatabase,
  populateFulfillment,
  snapshot,
  emptyContent,
  upgradeAddress,
} from './helpers/order-migration-db.js';

// PostgreSQL migration 20260928020000 added Order payment to populated wallet
// storage: `wallet_accounts.order_id`, journal `order_id/receipt_id` and the
// bigint posting sequence, with CHECKs that an OrderHold account names its
// Order. MongoDB has no such upgrade step: those fields and rules are in the
// baseline schema (0001) and the finite simulator capital is reference data
// (0002, inserted only when absent). This suite re-applies the wallet/order
// payment parts to a dedicated database holding populated history and checks
// the same resulting guarantees: history and historical balances are not
// rewritten, the simulator source is unchanged, and each guard holds as a
// validator (121), an app-user privilege (13), the write protocol (W) or a
// commit-time check (C).
const PAYMENT_COLLECTIONS = [
  'wallet_accounts',
  'ledger_journals',
  'ledger_entries',
  'topup_intents',
  'direct_orders',
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
  'wallet_accounts',
  'ledger_journals',
  'ledger_entries',
  'counters',
];

describe('order payment storage on populated wallet data (MongoDB)', () => {
  let x: Awaited<ReturnType<typeof orderUpgradeDatabase>>;
  beforeAll(async () => {
    x = await orderUpgradeDatabase('order_payment');
  }, 60000);
  afterAll(async () => {
    await x?.close();
  });

  it('upgrades wallet storage without changing historical balances, opening source, address/listing or receipts', async () => {
    const { db, rootDb, mongo, owner, send } = x;
    const { addressId, listingId } = await populateFulfillment(send);
    const before = await snapshot(rootDb, HISTORY);
    expect(before.mutation_receipts).toHaveLength(3);
    // Re-apply the wallet/order payment schema (0001) and the simulator
    // reference data (0002), as the migrator, to populated storage.
    await applyCollectionSpecs(
      db.client.db(),
      currentCollections().filter((s) => PAYMENT_COLLECTIONS.includes(s.name)),
    );
    await migrations
      .find((m) => m.id === '0002-reference-data')!
      .up(db.client.db(), db.client);
    expect(await snapshot(rootDb, HISTORY)).toEqual(before);
    // The Order columns the SQL migration added are explicit nulls on the
    // existing accounts/journal; the opening journal keeps sequence 1.
    expect(
      await rootDb
        .collection('wallet_accounts')
        .find({}, { projection: { _id: 0, purpose: 1, orderId: 1 } })
        .sort({ purpose: 1 })
        .toArray(),
    ).toEqual([
      // Migration 0012 adds the single platform commission account.
      { purpose: 'PlatformCommission', orderId: null },
      { purpose: 'SimulatorCapital', orderId: null },
      { purpose: 'SimulatorClearing', orderId: null },
    ]);
    expect(
      await rootDb
        .collection('ledger_journals')
        .find(
          {},
          {
            projection: {
              _id: 1,
              type: 1,
              sequence: 1,
              orderId: 1,
              receiptId: 1,
            },
          },
        )
        .toArray(),
    ).toEqual([
      {
        _id: OPENING_JOURNAL_ID,
        type: 'OpeningCapital',
        sequence: 1,
        orderId: null,
        receiptId: null,
      },
    ]);
    expect(
      await rootDb
        .collection('ledger_entries')
        .aggregate([
          {
            $group: {
              _id: null,
              debit: { $sum: '$debit' },
              credit: { $sum: '$credit' },
            },
          },
          { $project: { _id: 0 } },
        ])
        .toArray(),
    ).toEqual([{ debit: 100000000, credit: 100000000 }]);
    expect(
      await rootDb
        .collection('counters')
        .findOne({ _id: LEDGER_SEQUENCE_COUNTER as never }),
    ).toEqual({ _id: LEDGER_SEQUENCE_COUNTER, value: 1 });
    expect(await rootDb.collection('topup_intents').countDocuments()).toBe(0);
    expect(await rootDb.collection('sale_quotes').countDocuments()).toBe(0);
    expect(await db.c.sale_quote_policies.find({}).toArray()).toEqual([
      {
        _id: 'HCM-DIRECT-v1',
        shippingFee: 30000,
        commissionBps: 500,
        ttlSeconds: 300,
      },
    ]);
    const report = await mongo.tx((tx) => checkIntegrity(tx, 1000));
    expect(report.failures).toEqual([]);

    // Reserved without an active commitment: commit-time check (C), which
    // aborts the transaction that attempts it.
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
    // Receipts are append-only (P).
    const receipt = (before.mutation_receipts as Record<string, unknown>[])[0];
    await expect(
      mongo.c.mutation_receipts.deleteOne({ _id: receipt._id as string }),
    ).rejects.toMatchObject({ code: 13 });
    // Journals and entries are immutable for the application user (P,
    // formerly latlai_wallet_immutable).
    await expect(
      mongo.c.ledger_journals.updateMany({}, { $set: { sequence: 99 } }),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.ledger_entries.updateMany({}, { $inc: { debit: 1 } }),
    ).rejects.toMatchObject({ code: 13 });
    await expect(
      mongo.c.wallet_accounts.deleteOne({ _id: CAPITAL_ACCOUNT_ID }),
    ).rejects.toMatchObject({ code: 13 });
    // An OrderHold account must name its Order (V, wallet_account_shape).
    await expect(
      mongo.c.wallet_accounts.insertOne({
        _id: randomUUID(),
        ownerId: null,
        orderId: null,
        purpose: 'OrderHold',
        currency: 'VND',
      }),
    ).rejects.toMatchObject({ code: 121 });
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
    // Capital, clearing and (migration 0012) platform commission only.
    expect(await rootDb.collection('wallet_accounts').countDocuments()).toBe(3);
    expect(await rootDb.collection('ledger_journals').countDocuments()).toBe(1);
  });
});
