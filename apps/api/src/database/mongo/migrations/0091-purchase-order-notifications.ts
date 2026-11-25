import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';

export function withPurchaseOrderNotifications(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'member_notifications') return spec;
  const next = structuredClone(spec);
  next.schema.properties.kind.enum = [
    ...(next.schema.properties.kind.enum as string[]),
    'OrderCreatedAwaitingPayment',
    'PurchaseQuoteReady',
  ];
  next.schema.properties.targetType.enum = [
    ...(next.schema.properties.targetType.enum as string[]),
    'PurchaseConversation',
  ];
  return next;
}

export function createPurchaseOrderNotificationsMigration(previous: CollectionSpec) {
  const collections = [withPurchaseOrderNotifications(previous)];
  return {
    id: '0091-purchase-order-notifications',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
