import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { migrate } from './database/mongo/migrate.js';

// Applies versioned MongoDB migrations as the migrator user. Never logs URLs.
const url = process.env.MONGODB_MIGRATOR_URL;
if (!url) {
  console.error('Set MONGODB_MIGRATOR_URL (latlai_migrator credentials).');
  process.exit(1);
}
const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const applied = await migrate(client, client.db(), undefined, (line) =>
    console.log(line),
  );
  console.log(
    applied.length
      ? `Applied ${applied.length} migration(s).`
      : 'MongoDB schema is current.',
  );
} catch (error) {
  console.error(
    `Migration failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
