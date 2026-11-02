import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { migrate } from '../../src/database/mongo/migrate.js';
import { migrations } from '../../src/database/mongo/migrations/index.js';
import { testUrl } from './harness.js';

it('upgrades populated v1 AI reviews without changing decisions or applied migration checksums', async () => {
  const client = await new MongoClient(
    testUrl(`auto_review_v2_${randomUUID().replaceAll('-', '')}_test`),
  ).connect();
  const db = client.db();
  try {
    const bridge = migrations.findIndex(m => m.id === '0056-auto-review-v2-upgrade-bridge');
    expect(bridge).toBeGreaterThan(0);
    await migrate(client, db, migrations.slice(0, bridge));
    const before = await db.collection('_migrations').find().toArray();
    const row = {
      _id: randomUUID(), revisionId: randomUUID(), listingId: randomUUID(),
      outcome: 'Escalated', reasons: ['QA_LEGACY'], assessment: null,
      model: null, decidedAt: new Date(),
    };
    await db.collection('listing_auto_reviews').insertOne(row as never);
    await migrate(client, db);
    expect(await db.collection('listing_auto_reviews').findOne({ _id: row._id as never })).toEqual({
      ...row, policyVersion: null, facts: null, photoHashes: [], sampleBucket: null,
      inputTokens: 0, outputTokens: 0, costMicroUsd: 0, latencyMs: null,
    });
    for (const applied of before)
      expect(await db.collection('_migrations').findOne({ _id: applied._id })).toEqual(applied);
    await expect(db.collection('listing_auto_reviews').insertOne({ ...row, _id: randomUUID() } as never))
      .rejects.toMatchObject({ code: 121 });
    expect(await migrate(client, db)).toEqual([]);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
