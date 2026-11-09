import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { migrate } from '../../src/database/mongo/migrate.js';
import { currentCollections, migrations, validatorOf } from '../../src/database/mongo/migrations/index.js';
import { appPrivileges } from '../../src/database/mongo/roles.js';
import { testUrl } from './harness.js';
import { exchangeFlexibleDiffSpecs } from '../../src/database/mongo/migrations/0055-exchange-negotiated-diff-payer.js';

it.each(['main-first', 'demo-first'] as const)('upgrades %s without rewriting applied checksums, ledger or Exchange rules', async (order) => {
  const pending = [...(order === 'main-first' ? ['0054-local-demo-completion'] : ['0054-exchange-negotiated-diff', '0055-exchange-negotiated-diff-payer']), '0060-wallet-withdrawals', '0061-manual-wallet-withdrawals', '0062-message-send-limits', '0063-auction-buy-now-mode', '0064-auction-bid-holds', '0065-auction-types', '0066-auction-registration', '0067-auction-lifecycle', '0068-auction-resume', '0069-auction-scheduled-open'];
  const client = await new MongoClient(testUrl(`local_demo_upgrade_${randomUUID().replaceAll('-', '')}_test`)).connect();
  const db = client.db();
  try {
    await migrate(client, db, migrations.filter(m => !pending.includes(m.id)));
    const applied = await db.collection('_migrations').find().sort({ _id: 1 }).toArray();
    const entries = await db.collection('ledger_entries').find().sort({ _id: 1 }).toArray();
    expect(await migrate(client, db)).toEqual(pending);
    expect(await migrate(client, db)).toEqual([]);
    expect(await db.collection('_migrations').find({ _id: { $in: applied.map(m => m._id) } }).sort({ _id: 1 }).toArray()).toEqual(applied);
    expect(await db.collection('ledger_entries').find().sort({ _id: 1 }).toArray()).toEqual(entries);
    for (const name of ['direct_orders', 'mutation_receipts', 'audit_events', 'local_demo_order_completions']) {
      const [info] = await db.listCollections({ name }, { nameOnly: false }).toArray();
      if (!('options' in info) || !info.options) throw new Error('Expected collection metadata');
      expect(info.options.validator).toEqual(validatorOf(currentCollections().find(s => s.name === name)!));
    }
    const [exchange] = await db.listCollections({ name: 'exchanges' }, { nameOnly: false }).toArray();
    if (!('options' in exchange) || !exchange.options) throw new Error('Expected Exchange metadata');
    expect(exchange.options.validator).toEqual(validatorOf(exchangeFlexibleDiffSpecs[0]));
    expect(appPrivileges(db.databaseName).find(p => p.resource.collection === 'local_demo_order_completions')?.actions).toEqual(['find', 'insert', 'update']);
  } finally { await db.dropDatabase(); await client.close(); }
});
