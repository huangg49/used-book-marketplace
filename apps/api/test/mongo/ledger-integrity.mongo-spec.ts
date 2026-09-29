import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import {
  bindCollections,
  type Collections,
} from '../../src/database/mongo/collections.js';
import { runTransaction } from '../../src/database/mongo/transaction.js';
import { OPENING_JOURNAL_ID } from '../../src/database/mongo/migrations/0002-reference-data.js';
import { checkIntegrity } from '../../src/integrity/integrity.js';
import {
  CLEARING_ID,
  LedgerService,
} from '../../src/modules/wallet/ledger.service.js';
import { prepareDatabase, testUrl } from './harness.js';

// These are intentional corruptions by a raw app writer, not HTTP abilities.
// Each case owns a fresh QA DB. No bypassDocumentValidation or elevated writes.
describe('ledger reconciliation backstops', () => {
  let client: MongoClient, c: Collections;
  beforeEach(async () => {
    const { appUrl } = await prepareDatabase(
      testUrl('latlai_ledger_integrity_test'),
    );
    client = await new MongoClient(appUrl).connect();
    c = bindCollections(client.db());
  });
  afterEach(async () => {
    await client?.close();
  });
  const sweep = () =>
    runTransaction(client, client.db(), (tx) => checkIntegrity(tx));
  const reconcile = () =>
    runTransaction(client, client.db(), (tx) =>
      new LedgerService().reconcile(tx),
    );
  async function account(ownerExists = true) {
    const ownerId = randomUUID(),
      accountId = randomUUID(),
      now = new Date();
    if (ownerExists)
      await c.users.insertOne({
        _id: ownerId,
        emailNormalized: `${ownerId}@integrity.test`,
        passwordHash: 'test-only',
        displayName: 'QA',
        status: 'ACTIVE',
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
        roles: [{ role: 'MEMBER', grantedAt: now }],
        lockSeq: 0,
      });
    await c.wallet_accounts.insertOne({
      _id: accountId,
      ownerId,
      orderId: null,
      purpose: 'UserAvailable',
      currency: 'VND',
    });
    return { ownerId, accountId };
  }
  async function rejectsBoth(message: string) {
    await expect(reconcile()).rejects.toThrow(message);
    expect((await sweep()).failures).toContainEqual({
      aggregate: 'ledger',
      id: '*',
      error: message,
    });
  }
  it('accepts opening capital and an empty wallet of an existing user, without writes', async () => {
    await account();
    const before = await c.ledger_entries.find({}).toArray();
    expect((await sweep()).failures).toEqual([]);
    expect(await reconcile()).toMatchObject({
      balanced: true,
      sourceRemaining: 100_000_000,
      memberAvailable: 0,
    });
    expect(await c.ledger_entries.find({}).toArray()).toEqual(before);
  });
  it('rejects a balanced transfer whose journal does not exist', async () => {
    const { accountId, ownerId } = await account(),
      journalId = randomUUID();
    await c.ledger_entries.insertMany([
      {
        _id: `${journalId}:${CLEARING_ID}`,
        journalId,
        accountId: CLEARING_ID,
        debit: 0,
        credit: 1000,
      },
      {
        _id: `${journalId}:${accountId}`,
        journalId,
        accountId,
        debit: 1000,
        credit: 0,
      },
    ]);
    expect(
      await runTransaction(client, client.db(), (tx) =>
        new LedgerService().available(tx, ownerId),
      ),
    ).toBe(1000);
    await rejectsBoth('Ledger entry references a missing journal');
  });
  it('rejects an entry with an existing journal but a missing account', async () => {
    const accountId = randomUUID(),
      journalId = OPENING_JOURNAL_ID;
    await c.ledger_entries.insertOne({
      _id: `${journalId}:${accountId}`,
      journalId,
      accountId,
      debit: 1000,
      credit: 0,
    });
    await rejectsBoth('Ledger entry references a missing account');
  });
  it('rejects an unused wallet whose owner does not exist', async () => {
    await account(false);
    await rejectsBoth('Wallet account references a missing owner');
  });
  it('rejects an unused hold whose Order does not exist', async () => {
    await c.wallet_accounts.insertOne({
      _id: randomUUID(),
      ownerId: null,
      orderId: randomUUID(),
      purpose: 'OrderHold',
      currency: 'VND',
    });
    await rejectsBoth('Wallet account references a missing Order');
  });
});
