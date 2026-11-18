import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { AccountLockDoc, WalletAccountDoc } from '../../src/database/mongo/documents.js';
import { migrate } from '../../src/database/mongo/migrate.js';
import { restorePlatformCommissionMigration as repair } from '../../src/database/mongo/migrations/0082-restore-platform-commission-account.js';
import { migrations } from '../../src/database/mongo/migrations/index.js';
import { testUrl } from './harness.js';

it('restores a missing platform commission account without posting or rewriting ledger entries', async () => {
  const client = await new MongoClient(
    testUrl(`commission_${randomUUID().replaceAll('-', '')}_test`),
  ).connect();
  const db = client.db();
  try {
    await migrate(client, db, migrations.filter((migration) => migration.id !== repair.id));
    const account = repair.definition.account;
    const filter = { _id: account._id };
    const accounts = db.collection<WalletAccountDoc>('wallet_accounts');
    const locks = db.collection<AccountLockDoc>('account_locks');
    const entries = db.collection('ledger_entries');
    const before = await entries.find().sort({ _id: 1 }).toArray();
    await accounts.deleteOne(filter);
    await locks.deleteOne(filter);

    expect(await migrate(client, db)).toEqual([repair.id]);
    expect(await accounts.findOne(filter)).toEqual(account);
    expect(await locks.findOne(filter)).toEqual(repair.definition.lock);

    await locks.updateOne(filter, { $inc: { lockSeq: 7 } });
    await repair.up(db, client);
    expect(await migrate(client, db)).toEqual([]);
    expect(await locks.findOne(filter)).toMatchObject({ lockSeq: 7 });
    expect(await entries.find().sort({ _id: 1 }).toArray()).toEqual(before);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
}, 60000);
