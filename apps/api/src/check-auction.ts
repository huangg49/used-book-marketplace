import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { bindCollections } from './database/mongo/collections.js';

const client = new MongoClient(process.env.MONGODB_URL!);

async function main() {
  await client.connect();
  const c = bindCollections(client.db());
  const oneAuction = await c.auctions.findOne({});
  console.log('Auction doc keys & status:', Object.keys(oneAuction || {}), {
    title: (oneAuction as any)?.title,
    status: (oneAuction as any)?.status,
    state: (oneAuction as any)?.state,
    phase: (oneAuction as any)?.phase,
    pricing: (oneAuction as any)?.pricing,
  });
  console.log('Sample auction:', JSON.stringify(oneAuction, null, 2));
}

main().catch(console.error).finally(() => client.close());
