import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { migrate } from '../../src/database/mongo/migrate.js';
import { currentCollections, migrations, validatorOf } from '../../src/database/mongo/migrations/index.js';
import { appPrivileges } from '../../src/database/mongo/roles.js';
import { testUrl } from './harness.js';

it('adds local demo completion without rewriting historical migrations, entries or normal validators', async () => {
  const client = await new MongoClient(testUrl(`local_demo_upgrade_${randomUUID().replaceAll('-', '')}_test`)).connect();
  const db = client.db();
  try {
    await migrate(client, db, migrations.filter(m => m.id !== '0054-local-demo-completion'));
    const applied = await db.collection('_migrations').find().sort({ _id: 1 }).toArray();
    const entries = await db.collection('ledger_entries').find().sort({ _id: 1 }).toArray();
    expect(await migrate(client, db)).toEqual(['0054-local-demo-completion']);
    expect(await migrate(client, db)).toEqual([]);
    expect(await db.collection('_migrations').find({ _id: { $in: applied.map(m => m._id) } }).sort({ _id: 1 }).toArray()).toEqual(applied);
    expect(await db.collection('ledger_entries').find().sort({ _id: 1 }).toArray()).toEqual(entries);
    for (const name of ['direct_orders', 'mutation_receipts', 'audit_events', 'local_demo_order_completions']) {
      const [info] = await db.listCollections({ name }, { nameOnly: false }).toArray();
      if (!('options' in info) || !info.options) throw new Error('Expected collection metadata');
      expect(info.options.validator).toEqual(validatorOf(currentCollections().find(s => s.name === name)!));
    }
    expect(appPrivileges(db.databaseName).find(p => p.resource.collection === 'local_demo_order_completions')?.actions).toEqual(['find', 'insert', 'update']);
  } finally { await db.dropDatabase(); await client.close(); }
});
