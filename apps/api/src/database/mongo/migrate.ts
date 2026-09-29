import type { Db, MongoClient } from 'mongodb';
import type { MigrationDoc } from './documents.js';
import { checksumOf, migrations, type Migration } from './migrations/index.js';

const LOCK_ID = '~lock';
const LOCK_MS = 10 * 60_000;

export class MigrationChecksumError extends Error {}

// Applies pending migrations in order, once. Applied migrations are verified by
// checksum; a changed definition stops the run instead of silently diverging.
export async function migrate(
  client: MongoClient,
  db: Db,
  list: Migration[] = migrations,
  log: (line: string) => void = () => undefined,
): Promise<string[]> {
  const ledger = db.collection<MigrationDoc & { lockedUntil?: Date }>(
    '_migrations',
  );
  const now = new Date();
  // Single runner: the lock document is created, or taken over once expired.
  try {
    await ledger.insertOne({
      _id: LOCK_ID,
      checksum: '',
      appliedAt: now,
      lockedUntil: new Date(now.getTime() + LOCK_MS),
    });
  } catch {
    const taken = await ledger.findOneAndUpdate(
      { _id: LOCK_ID, lockedUntil: { $lt: now } },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
    );
    if (!taken)
      throw new Error('Another MongoDB migration run holds the lock.');
  }
  const applied: string[] = [];
  try {
    for (const migration of list) {
      const checksum = checksumOf(migration);
      const done = await ledger.findOne({ _id: migration.id });
      if (done) {
        if (done.checksum !== checksum)
          throw new MigrationChecksumError(
            `Migration ${migration.id} changed after it was applied.`,
          );
        continue;
      }
      log(`Applying ${migration.id}`);
      await migration.up(db, client);
      await ledger.insertOne(
        { _id: migration.id, checksum, appliedAt: new Date() },
        { writeConcern: { w: 'majority' } },
      );
      applied.push(migration.id);
    }
  } finally {
    await ledger.deleteOne({ _id: LOCK_ID });
  }
  return applied;
}

export async function pendingMigrations(
  db: Db,
  list: Migration[] = migrations,
): Promise<string[]> {
  const done = new Map(
    (await db.collection<MigrationDoc>('_migrations').find().toArray()).map(
      (row) => [row._id, row.checksum],
    ),
  );
  return list.filter((m) => done.get(m.id) !== checksumOf(m)).map((m) => m.id);
}
