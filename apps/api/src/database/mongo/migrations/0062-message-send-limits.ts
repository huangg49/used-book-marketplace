import type { Db } from 'mongodb';
import { t, type CollectionSpec } from '../schema-dsl.js';

export function withMessageSendLimits(spec: CollectionSpec): CollectionSpec {
  const exchange = spec.name === 'exchange_messages';
  if (!exchange && spec.name !== 'purchase_messages') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...spec.schema.properties,
        body: t.str(2000),
        // Historic rows and system notices remain readable without this marker.
        ...(exchange ? { memberAuthored: t.bool() } : {}),
      },
    },
    indexes: [
      ...spec.indexes,
      exchange
        ? {
            key: { senderId: 1, memberAuthored: 1, sentAt: -1 },
            name: 'exchange_messages_sender_rate_idx',
          }
        : {
            key: { senderId: 1, sentAt: -1 },
            name: 'purchase_messages_sender_rate_idx',
          },
    ],
  };
}

export function createMessageSendLimitsMigration(specs: CollectionSpec[]) {
  const collections = specs.map(withMessageSendLimits);
  return {
    id: '0062-message-send-limits',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
