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
import {
  currentCollections,
  migrations,
} from '../../src/database/mongo/migrations/index.js';
import {
  runTransaction,
  serverNow,
} from '../../src/database/mongo/transaction.js';
import { prepareDatabase, testUrl } from './harness.js';

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
        onlinePriceSpecs.length +
        EMBEDDED_MODELS.length,
    ).toBe(POSTGRES_MODEL_COUNT);
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
      2,
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
