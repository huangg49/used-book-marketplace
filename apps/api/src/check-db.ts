import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { bindCollections } from './database/mongo/collections.js';

const client = new MongoClient(process.env.MONGODB_URL!);

async function main() {
  await client.connect();
  const c = bindCollections(client.db());
  console.log('--- Collections with documents ---');
  for (const [name, col] of Object.entries(c)) {
    try {
      const count = await col.countDocuments();
      if (count > 0) {
        console.log(name.padEnd(35), count);
      }
    } catch {
      console.error(name.padEnd(35), 'Could not read count.');
      process.exitCode = 1;
    }
  }
}

main().catch(() => {
  console.error('Could not read collection counts. Check the MongoDB connection and read permissions.');
  process.exitCode = 1;
}).finally(() => client.close());
