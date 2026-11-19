import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { bindCollections } from './database/mongo/collections.js';

const client = new MongoClient(process.env.MONGODB_URL!);

async function main() {
  await client.connect();
  const c = bindCollections(client.db());

  console.log('--- Direct Orders ---', await c.direct_orders.countDocuments());
  console.log('--- Exchanges ---', await c.exchanges.countDocuments());
  console.log('--- Withdrawals ---', await c.withdrawals.countDocuments());
  console.log('--- Transaction Reviews ---', await c.transaction_reviews.countDocuments());
  console.log('--- Support Cases ---', await c.support_cases.countDocuments());
  console.log('--- Point Incidents ---', await c.point_incidents.countDocuments());
  console.log('--- Auctions ---', await c.auctions.countDocuments());

  const auctionStates = await c.auctions.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]).toArray();
  console.log('Auction states:', auctionStates);

  const listingMod = await c.listings.aggregate([{ $group: { _id: '$moderation', count: { $sum: 1 } } }]).toArray();
  console.log('Listing moderation:', listingMod);

  const catalogStatus = await c.catalog_books.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray();
  console.log('Catalog status:', catalogStatus);
}

main().catch(() => {
  console.error('Could not read status counts. Check the MongoDB connection and read permissions.');
  process.exitCode = 1;
}).finally(() => client.close());
