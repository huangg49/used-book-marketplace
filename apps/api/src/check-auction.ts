import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { bindCollections } from './database/mongo/collections.js';

const client = new MongoClient(process.env.MONGODB_URL!);

async function main() {
  await client.connect();
  const c = bindCollections(client.db());
  const counts = await c.auctions.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$state', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  console.log('Auction counts by state:', counts);
}

main().catch(() => {
  console.error('Could not read auction counts. Check the MongoDB connection and read permissions.');
  process.exitCode = 1;
}).finally(() => client.close());
