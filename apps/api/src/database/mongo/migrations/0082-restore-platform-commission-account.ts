import type { Db, MongoClient } from 'mongodb';
import type { AccountLockDoc } from '../documents.js';
import { pointOrderSettlementMigration } from './0012-point-order-settlement.js';

const [account] = pointOrderSettlementMigration.definition.reference;
const lock: AccountLockDoc = { _id: account._id, lockSeq: 0 };

export const restorePlatformCommissionMigration = {
  id: '0082-restore-platform-commission-account',
  definition: { account, lock },
  async up(db: Db, client: MongoClient) {
    await client.withSession((session) =>
      session.withTransaction(async () => {
        await db.collection<AccountLockDoc>('account_locks').updateOne(
          { _id: lock._id },
          { $setOnInsert: lock },
          { session, upsert: true },
        );
        await db.collection<typeof account>('wallet_accounts').updateOne(
          { _id: account._id },
          { $setOnInsert: account },
          { session, upsert: true },
        );
      }),
    );
  },
};
