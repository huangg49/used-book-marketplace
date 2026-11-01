import type { Db } from 'mongodb';
import { document, index, t, type CollectionSpec } from '../schema-dsl.js';

export function withAccountControls(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'audit_events')
    return {
      ...spec,
      indexes: [
        ...spec.indexes,
        index(
          { accountId: 1, createdAt: -1, _id: -1 },
          'audit_account_history_idx',
        ),
      ],
    };
  if (spec.name !== 'users') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...spec.schema.properties,
        administrativeLock: {
          ...document({
            scope: t.enum('NewTransactions'),
            restoreStatus: t.enum('ACTIVE', 'RESTRICTED'),
            reason: t.str(1000),
            unlockCondition: t.str(1000),
            relatedReference: t.nstr(100),
            actorId: t.uuid(),
            createdAt: t.date(),
          }),
          bsonType: ['object', 'null'],
        },
      },
    },
  };
}
export function createAccountControlsMigration(previous: CollectionSpec[]) {
  const collections = previous.map(withAccountControls);
  return {
    id: '0048-account-controls',
    definition: {
      collections,
      policy: 'preserve-status-obligations-no-session-revocation-v1',
    },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
