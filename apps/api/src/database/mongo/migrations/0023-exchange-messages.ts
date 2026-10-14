import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, t, unique } from '../schema-dsl.js';

export const exchangeMessageSpecs: CollectionSpec[] = [
  {
    name: 'exchange_messages',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      exchangeId: t.uuid(),
      senderId: t.uuid(),
      body: t.str(1000),
      sentAt: t.date(),
    }),
    expr: { $gte: [{ $strLenCP: '$body' }, 1] },
    indexes: [
      unique(
        { exchangeId: 1, sentAt: 1, _id: 1 },
        'exchange_messages_exchange_sent_id_key',
      ),
      {
        key: { exchangeId: 1, sentAt: 1, _id: 1 },
        name: 'exchange_messages_exchange_sent_idx',
      },
    ],
  },
];

export const exchangeMessagesMigration = {
  id: '0023-exchange-messages',
  definition: { collections: exchangeMessageSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangeMessageSpecs);
  },
};
