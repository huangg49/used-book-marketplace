import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';

export function withSaleSettlementNotification(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'member_notifications') return spec;
  const next = structuredClone(spec);
  next.schema.properties.kind.enum = [
    ...(next.schema.properties.kind.enum as string[]),
    'OrderSaleSettled',
  ];
  return next;
}

export function createSaleSettlementNotificationMigration(previous: CollectionSpec) {
  const collections = [withSaleSettlementNotification(previous)];
  return {
    id: '0090-sale-settlement-notification',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
