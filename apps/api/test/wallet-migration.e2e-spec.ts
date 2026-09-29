import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { bindCollections } from '../src/database/mongo/collections.js';
import { migrate } from '../src/database/mongo/migrate.js';
import { migrations } from '../src/database/mongo/migrations/index.js';
import {
  LEDGER_SEQUENCE_COUNTER,
  OPENING_JOURNAL_ID,
} from '../src/database/mongo/migrations/0002-reference-data.js';
import { bootstrapRoles } from '../src/database/mongo/roles.js';
import { runTransaction } from '../src/database/mongo/transaction.js';
import { checkListing } from '../src/modules/listings/listing-projection.js';
import { E2E_DATABASE } from './mongo-global-setup.js';
import {
  TEST_APP_PASSWORD,
  TEST_MIGRATOR_PASSWORD,
  testUrl,
  withCredentials,
} from './mongo/harness.js';

// PostgreSQL applied every migration before 20260928010000_simulated_wallet,
// wrote history, then applied the wallet migration. The MongoDB equivalent of
// the wallet migration is 0002-reference-data (finite simulator capital, its
// opening journal and the posting sequence counter; the wallet collections
// and receipt/audit `topupId` already exist in the 0001 baseline). This suite
// upgrades a dedicated database from 0001 to the latest migration with
// existing history in place.
it('upgrades from the baseline without changing existing address/listing/receipt history and journals finite capital', async () => {
  const url = testUrl(`${E2E_DATABASE.replace(/_test$/, '')}_upgrade_test`);
  const root = await new MongoClient(url).connect();
  let migrator: MongoClient | undefined, app: MongoClient | undefined;
  const owner = randomUUID(),
    address = randomUUID(),
    listing = randomUUID(),
    revision = randomUUID(),
    receipt = randomUUID(),
    audit = randomUUID();
  try {
    const rootDb = root.db();
    await rootDb.dropDatabase();
    await bootstrapRoles(rootDb, {
      app: TEST_APP_PASSWORD,
      migrator: TEST_MIGRATOR_PASSWORD,
    });
    migrator = await new MongoClient(
      withCredentials(url, 'latlai_migrator', TEST_MIGRATOR_PASSWORD),
    ).connect();
    const target = '0002-reference-data';
    const before0002 = migrations.slice(
      0,
      migrations.findIndex((m) => m.id === target),
    );
    expect(await migrate(migrator, migrator.db(), before0002)).toEqual([
      '0001-baseline-schema',
    ]);
    // Existing history, written by the migrator under the baseline validators.
    const c = bindCollections(migrator.db());
    const now = new Date();
    await c.users.insertOne({
      _id: owner,
      emailNormalized: `${owner}@upgrade.test`,
      passwordHash: 'unused',
      displayName: 'Upgrade fixture',
      status: 'ACTIVE',
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
      roles: [{ role: 'MEMBER', grantedAt: now }],
      lockSeq: 0,
    });
    await c.address_books.insertOne({ _id: owner, version: 1, lockSeq: 0 });
    await c.member_addresses.insertOne({
      _id: address,
      ownerId: owner,
      version: 1,
      recipientName: 'Fixture',
      phone: '0900000000',
      serviceAreaCode: 'HCM-DEMO-v1',
      localityCode: 'DEMO-A',
      detail: 'Test address only',
      isDefault: true,
      createdAt: now,
    });
    await c.address_identities.insertOne({ _id: address, ownerId: owner });
    await c.listing_revisions.insertOne({
      _id: revision,
      listingId: listing,
      number: 1,
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
      submittedAt: null,
      ownershipDeclaredAt: null,
      createdAt: now,
      originAddressId: address,
      originAddressVersion: 1,
      originServiceAreaCode: 'HCM-DEMO-v1',
      lockSeq: 0,
    });
    await c.listings.insertOne({
      _id: listing,
      ownerId: owner,
      version: 1,
      moderation: 'Draft',
      visibility: 'Visible',
      trade: 'Available',
      currentRevisionId: revision,
      removalReason: null,
      deletedAt: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    const targets = {
      listingId: listing,
      bookId: null,
      mediaId: null,
      addressBookId: null,
      quoteId: null,
      contextId: null,
      topupId: null,
    };
    await c.mutation_receipts.insertOne({
      _id: receipt,
      principal: `user:${owner}`,
      actorId: owner,
      systemActor: null,
      operation: 'createListing',
      key: randomUUID(),
      payloadHash: 'a'.repeat(64),
      ...targets,
      resultVersion: 1,
      result: {},
      committedAt: now,
    });
    await c.audit_events.insertOne({
      _id: audit,
      actorId: owner,
      systemActor: null,
      receiptId: receipt,
      ...targets,
      action: 'createListing',
      before: null,
      after: null,
      reason: null,
      requestId: randomUUID(),
      createdAt: now,
    });
    const snapshot = async (db: Db) => {
      const rows: Record<string, unknown> = {};
      for (const name of [
        'users',
        'address_books',
        'member_addresses',
        'address_identities',
        'listing_revisions',
        'listings',
        'mutation_receipts',
        'audit_events',
      ])
        rows[name] = await db
          .collection(name)
          .find()
          .sort({ _id: 1 })
          .toArray();
      return rows;
    };
    const before = await snapshot(rootDb);
    expect(await migrate(migrator, migrator.db())).toEqual(
      migrations.slice(before0002.length).map((m) => m.id),
    );
    // Receipts/audits already carry `topupId: null` in the baseline, so unlike
    // the PostgreSQL column addition no field is expected to appear.
    expect(await snapshot(rootDb)).toEqual(before);
    expect(
      await rootDb
        .collection('wallet_accounts')
        .find({}, { projection: { _id: 0, purpose: 1 } })
        .sort({ purpose: 1 })
        .toArray(),
    ).toEqual([
      { purpose: 'SimulatorCapital' },
      { purpose: 'SimulatorClearing' },
    ]);
    expect(
      await rootDb
        .collection('ledger_journals')
        .find({}, { projection: { _id: 1, type: 1, sequence: 1 } })
        .toArray(),
    ).toEqual([
      { _id: OPENING_JOURNAL_ID, type: 'OpeningCapital', sequence: 1 },
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
    // Posting order continues after the opening journal (the bigint sequence).
    expect(
      await rootDb
        .collection('counters')
        .findOne({ _id: LEDGER_SEQUENCE_COUNTER as never }),
    ).toEqual({ _id: LEDGER_SEQUENCE_COUNTER, value: 1 });
    expect(await rootDb.collection('topup_intents').countDocuments()).toBe(0);
    expect(await rootDb.collection('sale_quotes').countDocuments()).toBe(0);
    expect(
      await rootDb.collection('sale_quote_policies').find().toArray(),
    ).toEqual([
      {
        _id: 'HCM-DIRECT-v1',
        shippingFee: 30000,
        commissionBps: 500,
        ttlSeconds: 300,
      },
    ]);

    // The guards still hold for the least-privilege application user.
    app = await new MongoClient(
      withCredentials(url, 'latlai_app', TEST_APP_PASSWORD),
    ).connect();
    const appDb = app.db(),
      a = bindCollections(appDb);
    // Reserved without an active commitment: commit-time check (C), which
    // aborts the transaction that attempts it.
    await expect(
      runTransaction(app, appDb, async (tx) => {
        await tx.c.listings.updateOne(
          { _id: listing },
          { $set: { trade: 'Reserved' }, $inc: { version: 1 } },
        );
        await checkListing(tx, listing);
      }),
    ).rejects.toThrow('Listing/commitment projection mismatch');
    expect(await a.listings.findOne({ _id: listing })).toMatchObject({
      trade: 'Available',
      version: 1,
    });
    // Receipts are append-only (P).
    await expect(
      a.mutation_receipts.deleteOne({ _id: receipt }),
    ).rejects.toMatchObject({ code: 13 });
    // A receipt still names exactly one target (V).
    await expect(
      a.mutation_receipts.insertOne({
        _id: randomUUID(),
        principal: `user:${owner}`,
        actorId: owner,
        systemActor: null,
        operation: 'bad',
        key: randomUUID(),
        payloadHash: 'b'.repeat(64),
        ...targets,
        addressBookId: owner,
        resultVersion: 1,
        result: {},
        committedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 121 });
  } finally {
    await app?.close();
    await migrator?.close();
    const db = root.db();
    await db.dropDatabase();
    await db.command({ dropAllUsersFromDatabase: 1 });
    await db.command({ dropAllRolesFromDatabase: 1 });
    await root.close();
  }
});
