import { buyNowNotificationsMigration } from '../../src/database/mongo/migrations/0029-buy-now-notifications.js';
import { randomUUID } from 'node:crypto';
import { MongoClient, MongoServerError, type Db } from 'mongodb';
import { COLLECTION_NAMES } from '../../src/database/mongo/collections.js';
import {
  migrate,
  MigrationChecksumError,
} from '../../src/database/mongo/migrate.js';
import {
  EMBEDDED_MODELS,
  INFRASTRUCTURE_COLLECTIONS,
  POSTGRES_MODEL_COUNT,
} from '../../src/database/mongo/migrations/0001-baseline-schema.js';
import {
  CAPITAL_ACCOUNT_ID,
  CLEARING_ACCOUNT_ID,
  OPENING_JOURNAL_ID,
} from '../../src/database/mongo/migrations/0002-reference-data.js';
import { priceAssistSpecs } from '../../src/database/mongo/migrations/0005-price-assist.js';
import { onlinePriceSpecs } from '../../src/database/mongo/migrations/0007-online-price-lookup.js';
import { auctionCollectionSpecs } from '../../src/database/mongo/migrations/0008-auctions.js';
import { pointOrderCollectionSpecs } from '../../src/database/mongo/migrations/0009-point-orders.js';
import { pointCollectionSpecs } from '../../src/database/mongo/migrations/0010-point-collection.js';
import { resolutionCollectionSpecs } from '../../src/database/mongo/migrations/0011-point-order-resolution.js';
import { settlementCollectionSpecs } from '../../src/database/mongo/migrations/0012-point-order-settlement.js';
import { rulesCollectionSpecs } from '../../src/database/mongo/migrations/0013-auction-business-rules.js';
import { purchaseConversationSpecs } from '../../src/database/mongo/migrations/0014-purchase-conversations.js';
import { conversationAgreementSpecs } from '../../src/database/mongo/migrations/0032-conversation-agreements.js';
import { sellerSelectedOrdersMigration } from '../../src/database/mongo/migrations/0028-seller-selected-orders.js';
import { applyCollectionSpecs } from '../../src/database/mongo/migrations/index.js';
import { notificationSpecs } from '../../src/database/mongo/migrations/0015-member-notifications.js';
import { accountRecoverySpecs } from '../../src/database/mongo/migrations/0017-account-recovery.js';
import { authOtpSpecs } from '../../src/database/mongo/migrations/0018-auth-otp.js';
import { exchangeCollectionSpecs } from '../../src/database/mongo/migrations/0016-exchanges.js';
import { directDeliveryCompletionSpecs } from '../../src/database/mongo/migrations/0020-direct-delivery-completion.js';
import { exchangeMessageSpecs } from '../../src/database/mongo/migrations/0023-exchange-messages.js';
import { inspectionEvidenceCollectionSpecs } from '../../src/database/mongo/migrations/0023-inspection-evidence.js';
import { pointIncidentCollectionSpecs } from '../../src/database/mongo/migrations/0024-point-incidents.js';
import { transactionReviewSpecs } from '../../src/database/mongo/migrations/0025-exchange-reviews.js';
import {
  currentCollections,
  migrations,
  paymentSpecs,
} from '../../src/database/mongo/migrations/index.js';
import {
  runTransaction,
  serverNow,
} from '../../src/database/mongo/transaction.js';
import { prepareDatabase, testUrl } from './harness.js';
import {
  allCategories,
  facetsFor,
} from '@used-books/api-contract/catalog-taxonomy';

// MIG-02: collections, validators, indexes, reference data and least privilege.

const rootUrl = testUrl('latlai_schema_test');
let root: MongoClient, app: MongoClient, migrator: MongoClient;
let rootDb: Db, appDb: Db;

beforeAll(async () => {
  const urls = await prepareDatabase(rootUrl);
  root = await new MongoClient(rootUrl).connect();
  app = await new MongoClient(urls.appUrl).connect();
  migrator = await new MongoClient(urls.migratorUrl).connect();
  rootDb = root.db();
  appDb = app.db();
});
afterAll(async () => {
  await rootDb.dropDatabase();
  await Promise.all([root.close(), app.close(), migrator.close()]);
});

const rejectsValidation = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ code: 121 });
const rejectsUnauthorized = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ code: 13 });
const now = () => new Date();

describe('migrations', () => {
  it('create every mapped collection with a validator; 45 models accounted for', async () => {
    const infos = await rootDb.listCollections().toArray();
    const byName = new Map(infos.map((c) => [c.name, c]));
    for (const name of COLLECTION_NAMES) {
      const info = byName.get(name) as { options?: { validator?: object } };
      expect(info, name).toBeDefined();
      expect(info.options?.validator, name).toBeDefined();
    }
    expect(
      currentCollections().length -
        INFRASTRUCTURE_COLLECTIONS.length -
        // MongoDB-native collections with no PostgreSQL model (ADR 0028).
        priceAssistSpecs.length -
        onlinePriceSpecs.length -
        // Auction/point collections (ADR 0030), also MongoDB-native.
        auctionCollectionSpecs.length -
        pointOrderCollectionSpecs.length -
        pointCollectionSpecs.length -
        resolutionCollectionSpecs.length -
        settlementCollectionSpecs.length -
        rulesCollectionSpecs.length +
        // Purchase conversations are Mongo-native; they do not correspond to a
        // PostgreSQL model in the baseline count.
        -purchaseConversationSpecs.length -
        conversationAgreementSpecs.length -
        // The notification inbox (FR-N03, migration 0015) is MongoDB-native too.
        notificationSpecs.length -
        // FR-A01/02/04 auth collections have no historical PostgreSQL model.
        accountRecoverySpecs.length -
        authOtpSpecs.length -
        exchangeCollectionSpecs.length +
        // Delivery events are Mongo-native immutable evidence, not a historical
        // PostgreSQL model.
        -directDeliveryCompletionSpecs.length -
        paymentSpecs.length -
        // N4 point operations (ADR 0030 amendment 2026-10-14) are Mongo-native.
        inspectionEvidenceCollectionSpecs.length -
        pointIncidentCollectionSpecs.length -
        // Exchange chat messages & reviews are Mongo-native.
        exchangeMessageSpecs.length -
        transactionReviewSpecs.length +
        EMBEDDED_MODELS.length,
    ).toBe(POSTGRES_MODEL_COUNT);
  });

  it('upgrades circulation labels without rewriting address keys or applied checksums', async () => {
    const db = root.db(
      `circulation_upgrade_${randomUUID().replaceAll('-', '')}_test`,
    );
    const migration = migrations.find(
      (item) => item.id === '0030-book-circulation-regions',
    )!;
    try {
      await migrate(
        root,
        db,
        migrations.filter((item) => item.id !== migration.id),
      );
      const existing = {
        _id: randomUUID(),
        ownerId: randomUUID(),
        version: 1,
        recipientName: 'QA legacy address',
        phone: '0900000000',
        serviceAreaCode: 'HCM-DEMO-v1',
        localityCode: 'DEMO-B',
        detail: 'QA-only address',
        isDefault: true,
        createdAt: new Date(),
      };
      await db.collection('member_addresses').insertOne(existing as never);
      const ledger = db.collection<{ _id: string; checksum: string }>(
        '_migrations',
      );
      const before = await ledger.find().toArray();
      expect(await migrate(root, db)).toEqual([migration.id]);
      expect(
        await db
          .collection('member_addresses')
          .findOne({ _id: existing._id as never }),
      ).toEqual(existing);
      expect(
        await db
          .collection('service_localities')
          .find({}, { sort: { code: 1 } })
          .toArray(),
      ).toEqual([
        {
          _id: 'HCM-DEMO-v1:DEMO-A',
          areaCode: 'HCM-DEMO-v1',
          code: 'DEMO-A',
          label: 'TP.HCM',
        },
        {
          _id: 'HCM-DEMO-v1:DEMO-B',
          areaCode: 'HCM-DEMO-v1',
          code: 'DEMO-B',
          label: 'Bình Dương',
        },
        {
          _id: 'HCM-DEMO-v1:DEMO-C',
          areaCode: 'HCM-DEMO-v1',
          code: 'DEMO-C',
          label: 'Vũng Tàu',
        },
      ]);
      for (const row of before)
        expect(await ledger.findOne({ _id: row._id })).toEqual(row);
      expect(await migrate(root, db)).toEqual([]);
      await migration.up(db, root);
      expect(await db.collection('service_localities').countDocuments()).toBe(
        3,
      );
    } finally {
      await db.dropDatabase();
    }
  });
  it('are idempotent and refuse an edited applied migration', async () => {
    expect(await migrate(migrator, migrator.db())).toEqual([]);
    const edited = migrations.map((m, i) =>
      i === 1 ? { ...m, definition: { changed: true } } : m,
    );
    await expect(
      migrate(migrator, migrator.db(), edited),
    ).rejects.toBeInstanceOf(MigrationChecksumError);
    // The lock is released after a failed run.
    expect(await migrate(migrator, migrator.db())).toEqual([]);
  });
  it('upgrades applied wallet migration0022 without rewriting its checksum or data', async () => {
    const db = root.db(
      `wallet_upgrade_${randomUUID().replaceAll('-', '')}_test`,
    );
    try {
      await migrate(
        root,
        db,
        migrations.filter(
          (m) =>
            ![
              '0023-direct-order-settlement-principals',
              '0024-vnpay-querydr',
              '0027-wallet-point-command-union',
            ].includes(m.id),
        ),
      );
      const before = await db
        .collection<{ _id: string; checksum: string }>('_migrations')
        .findOne({ _id: '0022-vnpay-wallet-listing-fees' });
      expect(before?.checksum).toBe(
        '68eaf37f04e73f0c6c87398a92c612237fb305f4e6ed82c68e7d6e78675dc0db',
      );
      const names = ['wallet_accounts', 'ledger_journals', 'ledger_entries'];
      const counts = await Promise.all(
        names.map((name) => db.collection(name).countDocuments()),
      );
      expect(await migrate(root, db)).toEqual([
        '0023-direct-order-settlement-principals',
        '0024-vnpay-querydr',
        '0027-wallet-point-command-union',
      ]);
      expect(
        await db
          .collection<{ _id: string; checksum: string }>('_migrations')
          .findOne({ _id: '0022-vnpay-wallet-listing-fees' }),
      ).toEqual(before);
      expect(
        await Promise.all(
          names.map((name) => db.collection(name).countDocuments()),
        ),
      ).toEqual(counts);
      expect(await migrate(root, db)).toEqual([]);
    } finally {
      await db.dropDatabase();
    }
  });
  it.each(['wallet', 'main'])(
    'upgrades the applied %s branch without losing schemas or rewriting checksums',
    async (lane) => {
      const db = root.db(
        `wallet_point_union_${randomUUID().replaceAll('-', '')}_test`,
      );
      const walletIds = new Set([
        '0022-vnpay-wallet-listing-fees',
        '0023-direct-order-settlement-principals',
        '0024-vnpay-querydr',
      ]);
      const mainIds = new Set([
        '0022-point-administration',
        '0023-inspection-evidence',
        '0024-point-incidents',
        '0022-exchange-completion',
        '0023-exchange-messages',
        '0024-exchange-notifications',
        '0025-exchange-reviews',
        '0026-exchange-mutual-completion',
      ]);
      // These snapshots predate the union and all migrations after it. Applying
      // newer schemas first would let missing historical migrations overwrite
      // them, modelling an impossible historical branch instead of an upgrade.
      const before = migrations
        .slice(
          0,
          migrations.findIndex((m) => m.id === '0027-wallet-point-command-union'),
        )
        .filter((m) => !(lane === 'wallet' ? mainIds : walletIds).has(m.id));
      try {
        await migrate(root, db, before);
        const ledger = db.collection<{ _id: string; checksum: string }>(
          '_migrations',
        );
        const checksums = new Map(
          (await ledger.find().toArray()).map((row) => [row._id, row.checksum]),
        );
        const journalCount = await db
          .collection('ledger_journals')
          .countDocuments();
        const entryCount = await db
          .collection('ledger_entries')
          .countDocuments();
        expect(await migrate(root, db)).toEqual(
          migrations.filter((m) => !checksums.has(m.id)).map((m) => m.id),
        );
        for (const row of await ledger.find().toArray())
          if (checksums.has(row._id))
            expect(row.checksum).toBe(checksums.get(row._id));
        expect(await db.collection('ledger_journals').countDocuments()).toBe(
          journalCount,
        );
        expect(await db.collection('ledger_entries').countDocuments()).toBe(
          entryCount,
        );
        const actual = new Map(
          (await db.listCollections().toArray()).map((c) => [
            c.name,
            'options' in c ? c.options?.validator : undefined,
          ]),
        );
        for (const spec of currentCollections()) {
          expect(actual.get(spec.name)?.$jsonSchema, spec.name).toEqual(
            spec.schema,
          );
          if (spec.expr)
            expect(actual.get(spec.name)?.$expr, spec.name).toEqual(spec.expr);
        }
        expect(await migrate(root, db)).toEqual([]);
      } finally {
        await db.dropDatabase();
      }
    },
  );
  it.each(['exchange-main', 'member-catalog'])(
    'upgrades %s to the union without rewriting applied checksums',
    async (lane) => {
      const db = root.db(
        `integration_upgrade_${randomUUID().replaceAll('-', '')}_test`,
      );
      const exchangeIds = new Set([
        '0016-exchanges',
        '0017-exchanges-phase2',
        '0018-exchanges-proposal-expiry',
        '0022-exchange-completion',
        '0023-exchange-messages',
        '0024-exchange-notifications',
        '0025-exchange-reviews',
        '0026-exchange-mutual-completion',
        '0027-exchange-multi-book',
      ]);
      const memberIds = new Set([
        '0016-catalog-classification',
        '0017-account-recovery',
        '0018-auth-otp',
        '0019-catalog-vocabulary-v2',
      ]);
      const before = migrations
        .slice(
          0,
          migrations.findIndex((m) => m.id === '0027-wallet-point-command-union'),
        )
        .filter(
          (m) => !(lane === 'exchange-main' ? memberIds : exchangeIds).has(m.id),
        );
      try {
        await migrate(root, db, before);
        const ledger = db.collection<{ _id: string; checksum: string }>(
          '_migrations',
        );
        const checksums = new Map(
          (await ledger.find().toArray()).map((row) => [row._id, row.checksum]),
        );
        expect(await migrate(root, db)).toEqual(
          migrations.filter((m) => !checksums.has(m.id)).map((m) => m.id),
        );
        const after = await ledger.find().toArray();
        expect(after).toHaveLength(migrations.length);
        for (const row of after)
          if (checksums.has(row._id))
            expect(row.checksum).toBe(checksums.get(row._id));
        expect(await migrate(root, db)).toEqual([]);
        const collections = await db.listCollections().toArray();
        for (const spec of currentCollections()) {
          const actual = collections.find(
            (collection) => collection.name === spec.name,
          );
          const validator =
            actual && 'options' in actual
              ? actual.options?.validator
              : undefined;
          expect(validator?.$jsonSchema).toEqual(spec.schema);
          if (spec.expr) expect(validator?.$expr).toEqual(spec.expr);
        }
      } finally {
        await db.dropDatabase();
      }
    },
  );
  it('upgrades v1 classification additively without changing historical revisions or checksums', async () => {
    const db = root.db(
      `catalog_upgrade_${randomUUID().replaceAll('-', '')}_test`,
    );
    try {
      const old = migrations.filter(
        (m) => m.id !== '0019-catalog-vocabulary-v2',
      );
      await migrate(root, db, old);
      const oldChecksum = (await db
        .collection('_migrations')
        .findOne({ _id: '0016-catalog-classification' as never }))!.checksum;
      const revision = {
        _id: randomUUID(),
        bookId: randomUUID(),
        number: 1,
        title: 'Legacy sample',
        authors: ['Test'],
        publisher: null,
        publicationYear: null,
        language: 'vi',
        edition: null,
        category: 'Manga / Comic',
        categoryId: 'manga',
        attributes: { genre: ['action'], audience: ['shounen'] },
        isbn: null,
        submittedAt: now(),
      };
      await db
        .collection<{ _id: string }>('catalog_revisions')
        .insertOne(revision);
      const next = {
        ...revision,
        _id: randomUUID(),
        bookId: randomUUID(),
        category: 'Sức khỏe / y học',
        categoryId: 'health',
        attributes: { topic: ['wellbeing'] },
      };
      await rejectsValidation(
        db.collection<{ _id: string }>('catalog_revisions').insertOne(next),
      );
      expect(await migrate(root, db)).toEqual(['0019-catalog-vocabulary-v2']);
      await db.collection<{ _id: string }>('catalog_revisions').insertOne(next);
      expect(
        await db
          .collection('catalog_revisions')
          .findOne({ _id: revision._id as never }),
      ).toEqual(revision);
      expect(
        (await db
          .collection('_migrations')
          .findOne({ _id: '0016-catalog-classification' as never }))!.checksum,
      ).toBe(oldChecksum);
      expect(await migrate(root, db)).toEqual([]);
    } finally {
      await db.dropDatabase();
    }
  });

  it('insert the finite simulator capital as one balanced opening journal', async () => {
    const entries = await rootDb
      .collection('ledger_entries')
      .find({ journalId: OPENING_JOURNAL_ID })
      .toArray();
    expect(entries.map((e) => [e.accountId, e.debit, e.credit]).sort()).toEqual(
      [
        [CAPITAL_ACCOUNT_ID, 0, 100_000_000],
        [CLEARING_ACCOUNT_ID, 100_000_000, 0],
      ].sort(),
    );
    expect(
      await rootDb
        .collection('counters')
        .findOne({ _id: 'ledger_journal_sequence' as never }),
    ).toMatchObject({ value: 1 });
    expect(await rootDb.collection('service_localities').countDocuments()).toBe(
      3,
    );
  });
});

describe('validators replace CHECK constraints', () => {
  const user = (over: object = {}) => ({
    _id: randomUUID(),
    emailNormalized: `${randomUUID()}@latlai.local`,
    passwordHash: 'x',
    displayName: 'Bạn đọc',
    status: 'ACTIVE',
    emailVerifiedAt: now(),
    createdAt: now(),
    updatedAt: now(),
    roles: [{ role: 'MEMBER', grantedAt: now() }],
    lockSeq: 0,
    ...over,
  });

  it('users: enum, required fields, unknown fields and duplicate roles', async () => {
    await appDb.collection('users').insertOne(user() as never);
    await rejectsValidation(
      appDb.collection('users').insertOne(user({ status: 'BANNED' }) as never),
    );
    await rejectsValidation(
      appDb.collection('users').insertOne(user({ extra: 1 }) as never),
    );
    const { emailVerifiedAt: _, ...missing } = user();
    await rejectsValidation(
      appDb.collection('users').insertOne(missing as never),
    );
    await rejectsValidation(
      appDb.collection('users').insertOne(
        user({
          roles: [
            { role: 'MEMBER', grantedAt: now() },
            { role: 'MEMBER', grantedAt: now() },
          ],
        }) as never,
      ),
    );
    await rejectsValidation(
      appDb.collection('users').insertOne(user({ _id: 'NOT-A-UUID' }) as never),
    );
  });

  it('catalog: ISBN-10/13 checksums, authors and confirmed ISBN state', async () => {
    const revision = (isbn: string | null, authors = ['Nguyễn Nhật Ánh']) => ({
      _id: randomUUID(),
      bookId: randomUUID(),
      number: 1,
      title: 'Cho tôi xin một vé đi tuổi thơ',
      authors,
      publisher: null,
      publicationYear: 2008,
      language: 'vi',
      edition: null,
      category: 'Văn học',
      isbn,
      submittedAt: now(),
    });
    const c = appDb.collection('catalog_revisions');
    await c.insertOne(revision('9780306406157') as never);
    await c.insertOne(revision('0306406152') as never);
    await c.insertOne(revision('080442957X') as never);
    await c.insertOne(revision(null) as never);
    const classified = {
      ...revision(null),
      category: 'Manga / Comic',
      categoryId: 'manga',
      attributes: { genre: ['action'], audience: ['shounen'] },
      series: 'Bộ truyện thử',
    };
    await c.insertOne(classified as never);
    for (const category of allCategories) {
      const attributes = Object.fromEntries(
        facetsFor(category.id)
          .filter((f) => f.options.length)
          .map((f) => [f.id, [f.options[0]!.id]]),
      );
      await c.insertOne({
        ...revision(null),
        categoryId: category.id,
        category: category.label,
        attributes,
      } as never);
    }
    for (const attributes of [
      { genre: ['unknown'] },
      { genre: ['action', 'action'] },
      { genre: [] },
      { unknown: ['action'] },
    ])
      await rejectsValidation(
        c.insertOne({ ...classified, _id: randomUUID(), attributes } as never),
      );
    await rejectsValidation(
      c.insertOne({
        ...classified,
        _id: randomUUID(),
        categoryId: 'unknown',
      } as never),
    );
    await rejectsValidation(
      c.insertOne({ ...classified, _id: randomUUID(), series: '' } as never),
    );
    await rejectsValidation(c.insertOne(revision('9780306406158') as never));
    await rejectsValidation(c.insertOne(revision('0306406153') as never));
    await rejectsValidation(c.insertOne(revision('9771234567003') as never));
    await rejectsValidation(c.insertOne(revision(null, []) as never));
    await rejectsValidation(c.insertOne(revision(null, ['   ']) as never));
    const book = (status: string, confirmedIsbn: string | null) => ({
      _id: randomUUID(),
      requesterId: randomUUID(),
      status,
      version: 1,
      currentRevisionId: null,
      confirmedIsbn,
      searchText: '',
      titleKey: '',
      createdAt: now(),
      updatedAt: now(),
      lockSeq: 0,
    });
    const b = appDb.collection('catalog_books');
    await b.insertOne(book('Confirmed', '9780306406157') as never);
    await rejectsValidation(
      b.insertOne(book('Pending', '9780306406157') as never),
    );
    await rejectsValidation(
      b.insertOne(book('Confirmed', '9780306406158') as never),
    );
    // Several unconfirmed rows may have no ISBN; confirmed ISBNs are unique.
    await b.insertOne(book('Pending', null) as never);
    await b.insertOne(book('Pending', null) as never);
    await expect(
      b.insertOne(book('Confirmed', '9780306406157') as never),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('listing revisions: mode/price and submitted completeness rules', async () => {
    const revision = (over: object) => ({
      _id: randomUUID(),
      listingId: randomUUID(),
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
      createdAt: now(),
      originAddressId: null,
      originAddressVersion: null,
      originServiceAreaCode: null,
      lockSeq: 0,
      ...over,
    });
    const c = appDb.collection('listing_revisions');
    await c.insertOne(revision({}) as never);
    await rejectsValidation(
      c.insertOne(revision({ salePrice: 50_000 }) as never),
    );
    await rejectsValidation(
      c.insertOne(revision({ mode: 'Sale', salePrice: 9_999 }) as never),
    );
    await rejectsValidation(
      c.insertOne(
        revision({
          mode: 'Sale',
          salePrice: 50_000,
          exchangeValue: 50_000,
        }) as never,
      ),
    );
    await rejectsValidation(
      c.insertOne(revision({ submittedAt: now(), mode: 'Sale' }) as never),
    );
    await c.insertOne(
      revision({
        originAddressId: randomUUID(),
        originAddressVersion: 1,
        originServiceAreaCode: 'HCM-DEMO-v1',
      }) as never,
    );
    await rejectsValidation(
      c.insertOne(
        revision({
          originAddressId: randomUUID(),
          originAddressVersion: 1,
          originServiceAreaCode: 'HCM-OTHER',
        }) as never,
      ),
    );
    await rejectsValidation(
      c.insertOne(
        revision({
          originAddressId: randomUUID(),
          originAddressVersion: 1,
        }) as never,
      ),
    );
  });

  it('orders: payment deadline, state/version shape and terminal time', async () => {
    const created = now();
    const order = (over: object) => ({
      _id: randomUUID(),
      buyerId: randomUUID(),
      sellerId: randomUUID(),
      quoteId: randomUUID(),
      version: 1,
      state: 'AwaitingPayment',
      createdAt: created,
      paymentDeadline: new Date(created.getTime() + 15 * 60_000),
      closedAt: null,
      paidAt: null,
      sellerConfirmationDeadline: null,
      cancellationRequestedAt: null,
      cancellationReason: null,
      lockSeq: 0,
      ...over,
    });
    const c = appDb.collection('direct_orders');
    await c.insertOne(order({}) as never);
    // Legacy imported orders predate the nullable delivery completion fields.
    await c.insertOne(
      order({
        state: 'PendingSellerConfirmation',
        version: 2,
        paidAt: new Date(created.getTime() + 60_000),
        sellerConfirmationDeadline: new Date(
          created.getTime() + 48 * 3_600_000 + 60_000,
        ),
      }) as never,
    );
    await rejectsValidation(
      c.insertOne(
        order({
          paymentDeadline: new Date(created.getTime() + 60_000),
        }) as never,
      ),
    );
    await rejectsValidation(c.insertOne(order({ version: 2 }) as never));
    await rejectsValidation(
      c.insertOne(order({ state: 'Cancelled', version: 2 }) as never),
    );
    const paidAt = new Date(created.getTime() + 60_000);
    await c.insertOne(
      order({
        state: 'PendingSellerConfirmation',
        version: 2,
        paidAt,
        sellerConfirmationDeadline: new Date(paidAt.getTime() + 48 * 3_600_000),
      }) as never,
    );
    await rejectsValidation(
      c.insertOne(
        order({
          state: 'PendingSellerConfirmation',
          version: 2,
          paidAt,
          sellerConfirmationDeadline: new Date(
            paidAt.getTime() + 47 * 3_600_000,
          ),
        }) as never,
      ),
    );
    const same = randomUUID();
    await rejectsValidation(
      c.insertOne(order({ buyerId: same, sellerId: same }) as never),
    );
  });

  it('quotes: derived money must match the policy arithmetic', async () => {
    const created = now();
    const quote = (over: object) => ({
      _id: randomUUID(),
      version: 1,
      buyerId: randomUUID(),
      sellerId: randomUUID(),
      listingId: randomUUID(),
      listingVersion: 3,
      listingRevisionId: randomUUID(),
      catalogRevisionId: randomUUID(),
      originAddressId: randomUUID(),
      originAddressVersion: 1,
      destinationAddressId: randomUUID(),
      destinationAddressVersion: 1,
      serviceAreaCode: 'HCM-DEMO-v1',
      policyCode: 'HCM-DIRECT-v1',
      bookPrice: 85_000,
      shippingFee: 30_000,
      commissionBps: 500,
      commission: 4_250,
      buyerTotal: 115_000,
      sellerProceeds: 110_750,
      createdAt: created,
      expiresAt: new Date(created.getTime() + 300_000),
      ...over,
    });
    const c = appDb.collection('sale_quotes');
    await c.insertOne(quote({}) as never);
    // (85,009 * 500 + 5000) / 10000 = 4250.95 -> 4250 (integer division).
    await c.insertOne(
      quote({
        bookPrice: 85_009,
        buyerTotal: 115_009,
        sellerProceeds: 110_759,
      }) as never,
    );
    await rejectsValidation(c.insertOne(quote({ commission: 4_251 }) as never));
    await rejectsValidation(
      c.insertOne(quote({ buyerTotal: 115_001 }) as never),
    );
    await rejectsValidation(
      c.insertOne(
        quote({ expiresAt: new Date(created.getTime() + 301_000) }) as never,
      ),
    );
  });

  it('ledger: one-sided positive entries and journal shapes', async () => {
    const journalId = randomUUID(),
      accountId = randomUUID();
    const entry = (debit: number, credit: number) => ({
      _id: `${journalId}:${accountId}`,
      journalId,
      accountId,
      debit,
      credit,
    });
    const c = appDb.collection('ledger_entries');
    await rejectsValidation(c.insertOne(entry(0, 0) as never));
    await rejectsValidation(c.insertOne(entry(5, 5) as never));
    await rejectsValidation(c.insertOne(entry(-5, 0) as never));
    await rejectsValidation(
      c.insertOne({ ...entry(5, 0), _id: 'wrong' } as never),
    );
    await c.insertOne(entry(5, 0) as never);
    await rejectsValidation(
      appDb.collection('ledger_journals').insertOne({
        _id: randomUUID(),
        sequence: 99,
        type: 'OpeningCapital',
        topupId: null,
        eventId: null,
        orderId: null,
        receiptId: null,
        postedAt: now(),
      } as never),
    );
  });

  it('receipts: exactly one principal and one target; system operation pairs', async () => {
    const receipt = (over: object) => ({
      _id: randomUUID(),
      principal: 'system:OrderExpiry',
      actorId: null,
      systemActor: 'OrderExpiry',
      operation: 'expireOrder',
      key: randomUUID(),
      payloadHash: 'a'.repeat(64),
      listingId: null,
      bookId: null,
      mediaId: null,
      addressBookId: null,
      quoteId: null,
      contextId: randomUUID(),
      topupId: null,
      resultVersion: 2,
      result: {},
      committedAt: now(),
      ...over,
    });
    const c = appDb.collection('mutation_receipts');
    await c.insertOne(receipt({}) as never);
    const vnpay = {
      principal: 'system:VNPaySandbox',
      systemActor: 'VNPaySandbox',
      operation: 'applyVNPayQuery',
      contextId: null,
      topupId: randomUUID(),
      pointId: null,
    };
    await c.insertOne(receipt(vnpay) as never);
    await rejectsValidation(
      c.insertOne(receipt({ ...vnpay, pointId: randomUUID() }) as never),
    );
    await rejectsValidation(
      c.insertOne(
        receipt({ ...vnpay, operation: 'settleDirectOrder' }) as never,
      ),
    );
    const pointActor = randomUUID();
    await c.insertOne(
      receipt({
        principal: `user:${pointActor}`,
        actorId: pointActor,
        systemActor: null,
        operation: 'createHandoverPoint',
        contextId: null,
        pointId: randomUUID(),
      }) as never,
    );
    await c.insertOne(
      receipt({
        principal: 'system:OrderInspectionExpiry',
        systemActor: 'OrderInspectionExpiry',
        operation: 'settleDirectOrder',
        pointId: null,
      }) as never,
    );
    await rejectsValidation(
      c.insertOne(
        receipt({
          principal: 'system:OrderInspectionExpiry',
          systemActor: 'OrderInspectionExpiry',
          operation: 'settleDirectOrder',
          pointId: randomUUID(),
        }) as never,
      ),
    );
    await rejectsValidation(
      c.insertOne(receipt({ operation: 'refundOrder' }) as never),
    );
    await rejectsValidation(
      c.insertOne(receipt({ listingId: randomUUID() }) as never),
    );
    const actor = randomUUID();
    await rejectsValidation(
      c.insertOne(
        receipt({ actorId: actor, principal: `user:${actor}` }) as never,
      ),
    );
    await rejectsValidation(
      c.insertOne(
        receipt({
          actorId: actor,
          systemActor: null,
          principal: `user:${randomUUID()}`,
          operation: 'payOrder',
        }) as never,
      ),
    );
  });
});

describe('partial unique indexes', () => {
  it('one active commitment per listing, released ones unlimited', async () => {
    const listingId = randomUUID();
    const commitment = (status: string) => ({
      _id: randomUUID(),
      listingId,
      currentContextId: randomUUID(),
      version: status === 'Active' ? 1 : 2,
      status,
      acquiredAt: now(),
      endedAt: status === 'Active' ? null : now(),
      reason: status === 'Active' ? null : 'Cancelled',
      lockSeq: 0,
    });
    const c = appDb.collection('exclusive_commitments');
    await c.insertOne(commitment('Released') as never);
    await c.insertOne(commitment('Released') as never);
    await c.insertOne(commitment('Active') as never);
    await expect(
      c.insertOne(commitment('Active') as never),
    ).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('one default address per owner', async () => {
    const ownerId = randomUUID();
    const address = (isDefault: boolean) => ({
      _id: randomUUID(),
      ownerId,
      version: 1,
      recipientName: 'Người nhận',
      phone: '0901234567',
      serviceAreaCode: 'HCM-DEMO-v1',
      localityCode: 'DEMO-A',
      detail: '12 Đường số 3',
      isDefault,
      createdAt: now(),
    });
    const c = appDb.collection('member_addresses');
    await c.insertOne(address(true) as never);
    await c.insertOne(address(false) as never);
    await expect(c.insertOne(address(true) as never)).rejects.toMatchObject({
      code: 11000,
    });
  });
});

describe('least-privilege application user', () => {
  it('cannot update or delete append-only history', async () => {
    const id = randomUUID();
    await appDb.collection('address_identities').insertOne({
      _id: id,
      ownerId: randomUUID(),
    } as never);
    await rejectsUnauthorized(
      appDb
        .collection('address_identities')
        .updateOne({ _id: id as never }, { $set: { ownerId: randomUUID() } }),
    );
    await rejectsUnauthorized(
      appDb.collection('address_identities').deleteOne({ _id: id as never }),
    );
    await rejectsUnauthorized(
      appDb.collection('ledger_entries').deleteMany({}),
    );
    await rejectsUnauthorized(
      appDb
        .collection('wallet_accounts')
        .updateOne(
          { _id: CAPITAL_ACCOUNT_ID as never },
          { $set: { purpose: 'OrderHold' } },
        ),
    );
  });

  it('cannot delete from mutable aggregates or write reference data', async () => {
    await rejectsUnauthorized(appDb.collection('direct_orders').deleteMany({}));
    await rejectsUnauthorized(appDb.collection('users').deleteMany({}));
    await rejectsUnauthorized(
      appDb
        .collection('sale_quote_policies')
        .updateOne(
          { _id: 'HCM-DIRECT-v1' as never },
          { $set: { commissionBps: 0 } },
        ),
    );
    await rejectsUnauthorized(
      appDb.collection('service_areas').insertOne({
        _id: 'X',
        name: 'X',
        demoOnly: true,
      } as never),
    );
  });

  it('cannot change schema, validators, indexes or migration history', async () => {
    await rejectsUnauthorized(appDb.createCollection('rogue'));
    await rejectsUnauthorized(
      appDb.command({ collMod: 'direct_orders', validator: {} }),
    );
    await rejectsUnauthorized(
      appDb.collection('direct_orders').createIndex({ state: -1 }),
    );
    await rejectsUnauthorized(
      appDb.collection('direct_orders').dropIndex('direct_orders_quote_id_key'),
    );
    await rejectsUnauthorized(
      appDb.collection('_migrations').insertOne({ _id: 'x' } as never),
    );
    // Validation cannot be bypassed by the application user.
    await expect(
      appDb.command({
        insert: 'users',
        documents: [{ _id: randomUUID() }],
        bypassDocumentValidation: true,
      }),
    ).rejects.toBeInstanceOf(MongoServerError);
  });

  it('may run transactions, read the server clock and delete where required', async () => {
    const at = await runTransaction(app, appDb, async (tx) => {
      await tx.c.login_attempts.insertOne({
        _id: 'probe',
        attempts: 1,
        expiresAt: now(),
      });
      await tx.c.login_attempts.deleteOne({ _id: 'probe' });
      return tx.now();
    });
    expect(at).toBeInstanceOf(Date);
    expect(await serverNow({ db: appDb })).toBeInstanceOf(Date);
  });
});


describe('seller-selected conversations upgrade', () => {
  it('backfills populated 24-hour conversations and replaces only the active-listing uniqueness', async () => {
    const db = root.db('latlai_seller_conversation_upgrade_test');
    try {
      await applyCollectionSpecs(db, purchaseConversationSpecs);
      const now = new Date(), sellerId = randomUUID();
      const rows = ['Active', 'Expired', 'Cancelled'].map((status) => ({
        _id: randomUUID(), listingId: randomUUID(), listingVersion: 1,
        buyerId: randomUUID(), sellerId, version: 1, status,
        expiresAt: new Date(now.getTime() + 86400000),
        closedAt: status === 'Active' ? null : now, createdAt: now, updatedAt: now, lockSeq: 0,
      }));
      await db.collection<{ _id: string }>('purchase_conversations').insertMany(rows);
      await sellerSelectedOrdersMigration.up(db);
      for (const row of rows) expect(await db.collection<{ _id: string }>('purchase_conversations').findOne({ _id: row._id }))
        .toEqual({ ...row, quoteId: null, orderId: null });
      const second = { ...rows[0], _id: randomUUID(), buyerId: randomUUID(), expiresAt: null, quoteId: null, orderId: null };
      await db.collection<{ _id: string }>('purchase_conversations').insertOne(second);
      await expect(db.collection<{ _id: string }>('purchase_conversations').insertOne({ ...second, _id: randomUUID() }))
        .rejects.toMatchObject({ code: 11000 });
      await sellerSelectedOrdersMigration.up(db);
      expect(await db.collection<{ _id: string }>('purchase_conversations').countDocuments()).toBe(4);
    } finally { await db.dropDatabase(); }
  });
});


describe('buy-now notification migration', () => {
  it('preserves populated inbox rows and indexes while admitting Order notifications with dedupe', async () => {
    const db = root.db('latlai_buy_now_notification_upgrade_test');
    const rows = db.collection<{ _id: string; [key: string]: unknown }>('member_notifications');
    try {
      const { exchangeNotificationSpecs } = await import('../../src/database/mongo/migrations/0024-exchange-notifications.js');
      await applyCollectionSpecs(db, exchangeNotificationSpecs);
      const old = { _id: randomUUID(), userId: randomUUID(), kind: 'ExchangeAccepted',
        title: 'QA exchange', body: 'QA only', targetType: 'Exchange', targetId: randomUUID(),
        dedupeKey: randomUUID(), createdAt: new Date(), readAt: null };
      await rows.insertOne(old);
      const indexes = await rows.indexes();
      await buyNowNotificationsMigration.up(db);
      expect(await rows.findOne({ _id: old._id })).toEqual(old);
      expect(await rows.indexes()).toEqual(indexes);
      const order = { ...old, _id: randomUUID(), kind: 'OrderBuyNowPaid', targetType: 'Order', dedupeKey: 'qa-buy-now-notice' };
      await rows.insertOne(order);
      await expect(rows.insertOne({ ...order, _id: randomUUID() })).rejects.toMatchObject({ code: 11000 });
      await expect(rows.insertOne({ ...order, _id: randomUUID(), dedupeKey: 'qa-invalid-kind', kind: 'MadeUp' })).rejects.toMatchObject({ code: 121 });
      await buyNowNotificationsMigration.up(db);
      expect(await rows.countDocuments()).toBe(2);
    } finally { await db.dropDatabase(); }
  });
});
