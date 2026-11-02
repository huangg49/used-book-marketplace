import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { migrate } from '../../src/database/mongo/migrate.js';
import {
  checksumOf,
  currentCollections,
  migrations,
} from '../../src/database/mongo/migrations/index.js';
import { testUrl } from './harness.js';
import { CAPITAL_INCREASE_JOURNAL_ID } from '../../src/database/mongo/migrations/0055-simulator-capital-increase.js';

const ids = [
  '0050-listing-auto-review',
  '0050-support-cases',
  '0051-support-auto-review-union',
];
const expected = new Map([
  [
    '0050-listing-auto-review',
    '30f6323290f5f889cecf0d676f18b7f93665e3e1d16b5c62bf259d192e947ca8',
  ],
  [
    '0050-support-cases',
    '69495bcd371be9cd681f637633dc6e5ba127055674083582da4854b8e04b7d3a',
  ],
]);
describe('support and AI auto review schema integration', () => {
  it.each(['auto-first', 'support-first', 'both-reversed'])(
    'upgrades %s without changing either applied 0050 checksum or data',
    async (lane) => {
      const client = await new MongoClient(
        testUrl(`support_auto_union_${randomUUID().replaceAll('-', '')}_test`),
      ).connect();
      const db = client.db();
      try {
        for (const [id, checksum] of expected)
          expect(checksumOf(migrations.find((m) => m.id === id)!)).toBe(
            checksum,
          );
        await migrate(
          client,
          db,
          // Only what precedes the union: later migrations belong to the upgrade.
          migrations
            .slice(0, migrations.findIndex((m) => m.id === ids[2]))
            .filter((m) => !ids.includes(m.id)),
        );
        const initialIds =
          lane === 'auto-first'
            ? [ids[0]]
            : lane === 'support-first'
              ? [ids[1]]
              : [ids[1], ids[0]];
        await migrate(
          client,
          db,
          initialIds.map((id) => migrations.find((m) => m.id === id)!),
        );
        const before = await db
          .collection<{ _id: string; checksum: string; appliedAt: Date }>(
            '_migrations',
          )
          .find({ _id: { $ne: '~lock' } })
          .toArray();
        const ledger = await db.collection('ledger_entries').find().toArray();
        const notice = {
          _id: randomUUID(),
          userId: randomUUID(),
          kind: 'ExchangeDisputed',
          title: 'QA existing inbox',
          body: 'Keep inbox',
          targetType: 'Exchange',
          targetId: randomUUID(),
          dedupeKey: randomUUID(),
          createdAt: new Date(),
          readAt: null,
        };
        await db.collection('member_notifications').insertOne(notice as never);
        const expectedPending = migrations
          .filter((m) => !before.some((row) => row._id === m.id))
          .map((m) => m.id);
        expect(await migrate(client, db)).toEqual(expectedPending);
        for (const row of before)
          expect(
          await db.collection<{ _id: string; checksum: string; appliedAt: Date }>('_migrations').findOne({ _id: row._id }),
          ).toEqual(row);
        // Only 0055 adds ledger rows: its fixed CapitalIncrease journal (ADR0067).
        expect(
          await db
            .collection('ledger_entries')
            .find({ journalId: { $ne: CAPITAL_INCREASE_JOURNAL_ID } })
            .toArray(),
        ).toEqual(ledger);
        expect(
          await db
            .collection('member_notifications')
            .findOne({ _id: notice._id as never }),
        ).toEqual(notice);
        const actual = await db.listCollections().toArray();
        for (const spec of currentCollections()) {
          const info = actual.find((c) => c.name === spec.name);
          const validator =
            info && 'options' in info ? info.options?.validator : undefined;
          expect(validator?.$jsonSchema, spec.name).toEqual(spec.schema);
          if (spec.expr) expect(validator?.$expr, spec.name).toEqual(spec.expr);
        }
        expect(await migrate(client, db)).toEqual([]);
      } finally {
        await db.dropDatabase();
        await client.close();
      }
    },
    60000,
  );
});
