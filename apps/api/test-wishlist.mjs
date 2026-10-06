import { MongoClient } from 'mongodb';
const url = 'mongodb://latlai_root:b5b98f7615bba840bb15e581f9774a340ed6d3419b7acfe9@localhost:27018/latlai?directConnection=true&authSource=admin';
const client = new MongoClient(url);
await client.connect();
const db = client.db('latlai');
try {
  await db.collection('wishlist_items').findOneAndUpdate(
    { userId: '5359f58f-cc0d-426c-8454-295bb6aa696d', subjectType: 'LISTING', subjectId: '5359f58f-cc0d-426c-8454-295bb6aa696d' },
    {
      $set: { wantsToExchange: true, receiveNotifications: true, updatedAt: new Date() },
      $setOnInsert: { _id: '5359f58f-cc0d-426c-8454-295bb6aa696d', createdAt: new Date() }
    },
    { upsert: true, returnDocument: 'after' }
  );
  console.log('Success');
} catch (e) {
  console.error(e);
} finally {
  await client.close();
}
