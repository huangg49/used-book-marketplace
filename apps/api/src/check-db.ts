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
      const count = await (col as any).countDocuments();
      if (count > 0) {
        console.log(name.padEnd(35), count);
      }
    } catch (e: any) {
      console.log(name.padEnd(35), 'Error:', e.message);
    }
  }
  console.log('\n--- Users ---');
  const users = await c.users.find({}, { projection: { emailNormalized: 1, displayName: 1, roles: 1, status: 1 } }).toArray();
  for (const u of users) {
    console.log(u.emailNormalized, '|', u.displayName, '|', JSON.stringify(u.roles), '|', u.status);
  }
}

main().catch(console.error).finally(() => client.close());
